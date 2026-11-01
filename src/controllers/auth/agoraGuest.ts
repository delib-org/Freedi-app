/**
 * Agora guest mode — a student sent here from an Agora village station
 * (docs/ia/agora-linked-app-stations.md §9.4).
 *
 * The station opens `/statement/:id#freedi-handoff=<code>&via=open&as=<s>~<i>`.
 * The gate reads the fragment, removes it from the address bar, redeems the
 * one-time code for a custom token of the student's OWN Agora uid and signs in
 * with it. Guest mode IS the `agora` claim on that ID token: it survives
 * reloads, and `isAnonymous` is not trustworthy after a custom-token sign-in.
 *
 * "Back to the village" signs the guest out and returns to a URL built from
 * the constant VITE_AGORA_ORIGIN plus the ids in the claim — never from a URL
 * parameter, so there is no open redirect.
 */
import { signInWithCustomToken, signOut, updateProfile, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
	AGORA_STATION_LINK,
	agoraGuestClaimOf,
	parseHandoffFragment,
	stationReturnUrl,
	type AgoraGuestClaim,
	type Creator,
	type RedeemAppHandoffRequest,
	type RedeemAppHandoffResponse,
	type StationHandoffFragment,
} from '@freedi/shared-types';
import { auth, functions } from '@/controllers/db/config';
import { setUserToDB } from '@/controllers/db/user/setUser';
import { logError } from '@/utils/errorHandling';

const DEFAULT_AGORA_ORIGIN = 'https://agora.wizcol.com';
/** How long "Back to the village" waits for the tab to close before navigating instead */
export const CLOSE_FALLBACK_MS = 400;

export function agoraOrigin(): string {
	return (import.meta.env.VITE_AGORA_ORIGIN || DEFAULT_AGORA_ORIGIN).replace(/\/+$/, '');
}

/** Where the way back lands: the session and the station, from the claim or the `as` hint */
export interface VillageTarget {
	sessionId: string;
	itemId: string;
}

export function villageTargetOf(claim: AgoraGuestClaim): VillageTarget {
	return { sessionId: claim.s, itemId: claim.i };
}

export function villageReturnUrl(target: VillageTarget, origin = agoraOrigin()): string {
	return stationReturnUrl(origin, target.sessionId, target.itemId);
}

/** The handoff in this page's fragment, if any */
export function readAgoraHandoff(hash = window.location.hash): StationHandoffFragment | null {
	return parseHandoffFragment(hash);
}

/** Take the code out of the address bar and history before anything else runs */
export function stripHandoffFragment(): void {
	window.history.replaceState(
		window.history.state,
		'',
		window.location.pathname + window.location.search,
	);
}

/** A real account (Google, email) that a guest sign-in would replace — ask first */
export function holdsRealAccount(user: Pick<User, 'isAnonymous' | 'providerData'> | null): boolean {
	return !!user && !user.isAnonymous && user.providerData.length > 0;
}

/** The guest claim of the signed-in user, or null */
export async function agoraGuestClaim(user: User | null): Promise<AgoraGuestClaim | null> {
	if (!user) return null;
	try {
		const { claims } = await user.getIdTokenResult();

		return agoraGuestClaimOf(claims);
	} catch (error) {
		logError(error, { operation: 'auth.agoraGuest.claim', userId: user.uid });

		return null;
	}
}

const redeemCallable = httpsCallable<RedeemAppHandoffRequest, RedeemAppHandoffResponse>(
	functions,
	'redeemAppHandoff',
);

export type GuestSignInFailure = 'expired' | 'ended' | 'failed';

/** What a refused redeem means for the student */
export function guestFailureOf(error: unknown): GuestSignInFailure {
	const failure = error as { details?: unknown } | null;
	const reason = (failure?.details as { reason?: unknown } | null | undefined)?.reason;
	if (reason === 'ended') return 'ended';
	if (reason === 'expired' || reason === 'wrong_app') return 'expired';

	return 'failed';
}

/**
 * Redeem the code and sign in as the student. Whatever was signed in on this
 * browser before is signed out first (the caller asked about a real account),
 * and a name a previous visitor typed on this device is forgotten — the
 * guest is known by their Agora pseudonym only.
 */
export async function signInAsAgoraGuest(code: string): Promise<AgoraGuestClaim> {
	const { data } = await redeemCallable({ code, app: 'main' });
	if (auth.currentUser) await signOut(auth);
	localStorage.removeItem('displayName');
	const { user } = await signInWithCustomToken(auth, data.token);
	await updateProfile(user, { displayName: data.displayName });
	const creator: Creator = {
		uid: user.uid,
		displayName: data.displayName,
		photoURL: null,
		email: null,
		isAnonymous: true,
	};
	await setUserToDB(creator);

	return { s: data.sessionId, i: data.itemId, q: data.statementId };
}

/**
 * "Back to the village". Signs the guest out of this app, then: in a tab the
 * station opened, tells the village and closes; anywhere else (or when the
 * close does not happen), navigates to the station.
 */
export async function leaveToVillage(
	target: VillageTarget,
	openedByStation: boolean,
): Promise<void> {
	const url = villageReturnUrl(target);
	try {
		await signOut(auth);
	} catch (error) {
		logError(error, { operation: 'auth.agoraGuest.leaveToVillage', metadata: { ...target } });
	}
	const opener = openedByStation ? window.opener : null;
	if (opener && !opener.closed) {
		try {
			opener.postMessage(
				{ type: AGORA_STATION_LINK.RETURN_MESSAGE, itemId: target.itemId },
				agoraOrigin(),
			);
			window.close();
		} catch (error) {
			logError(error, { operation: 'auth.agoraGuest.notifyOpener', metadata: { ...target } });
		}
		window.setTimeout(() => window.location.assign(url), CLOSE_FALLBACK_MS);

		return;
	}
	window.location.assign(url);
}

const OPENED_KEY = 'agoraGuestOpened';

/** Remember, for this tab, that the station opened it (the fragment is gone after the gate) */
export function rememberOpenedByStation(opened: boolean): void {
	try {
		if (opened) sessionStorage.setItem(OPENED_KEY, '1');
	} catch {
		// Private mode: the way back still works, by navigation
	}
}

export function wasOpenedByStation(): boolean {
	try {
		return sessionStorage.getItem(OPENED_KEY) === '1';
	} catch {
		return false;
	}
}
