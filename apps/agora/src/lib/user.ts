import m from 'mithril';
import {
	auth,
	canCompleteRedirectSignIn,
	signInAnonymously,
	signInWithCredential,
	signInWithCustomToken,
	GoogleAuthProvider,
	signInWithPopup,
	signInWithRedirect,
	getRedirectResult,
	linkWithPopup,
	onAuthStateChanged,
	User,
} from './firebase';
import type { FirebaseError } from './firebase';
import { classifySignInFailure } from './signInErrors';

/**
 * Identity tiers:
 * 0 = Anonymous student/team (real Firebase anon uid — rules and triggers work)
 * 2 = Google Auth (teachers)
 */
export type IdentityTier = 0 | 2;

/**
 * Why the last teacher sign-in did not finish. Kept on the state because the
 * button used to swallow every failure into console.error: a teacher whose
 * sign-in died saw the same screen with no word about what happened, and
 * pressed the button again, and saw it again.
 */
export type SignInError = 'popup-blocked' | 'failed' | null;

export interface UserState {
	user: User | null;
	tier: IdentityTier;
	loading: boolean;
	signInError: SignInError;
}

const state: UserState = {
	user: null,
	tier: 0,
	loading: true,
	signInError: null,
};

let _resolveAuthReady: () => void;
const authReadyPromise = new Promise<void>((resolve) => {
	_resolveAuthReady = resolve;
});

/** Get current user state (read-only) */
export function getUserState(): Readonly<UserState> {
	return state;
}

/** Wait for Firebase to settle auth (persisted session or null) */
export function waitForAuthReady(): Promise<void> {
	return authReadyPromise;
}

/**
 * Ensure there is a signed-in user. Students get an anonymous account —
 * the anon uid is the participant unit (a whole team in team mode).
 */
export async function ensureUser(): Promise<User> {
	await waitForAuthReady();

	if (auth.currentUser) {
		return auth.currentUser;
	}

	const credential = await signInAnonymously(auth);

	return credential.user;
}

/**
 * Sign in as the player who just walked through an Odyssey island's gate.
 *
 * The token names their existing uid, so they arrive as themselves rather than
 * as a fresh anonymous stranger — which is the whole point: the join callable
 * reads the stances they took on that island to place them in a camp, and it
 * can only find them under their own uid.
 *
 * Signing in unconditionally is correct even when someone is already signed in
 * here: if it is the same person the exchange is identity-neutral, and if it is
 * not, the arriving player is the one who should win.
 */
export async function signInWithHandoff(token: string): Promise<User> {
	await waitForAuthReady();

	const credential = await signInWithCustomToken(auth, token);

	return credential.user;
}

/**
 * Teacher sign-in with Google. Links an anonymous account when one exists
 * so a teacher who first explored as a student keeps their uid.
 */
export async function signInWithGoogle(): Promise<void> {
	if (state.tier === 2) return;

	state.signInError = null;

	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });

	const currentUser = auth.currentUser;

	try {
		if (currentUser && currentUser.isAnonymous) {
			await linkWithPopup(currentUser, provider);
		} else {
			await signInWithPopup(auth, provider);
		}
		state.tier = 2;
		m.redraw();
	} catch (error: unknown) {
		switch (classifySignInFailure((error as { code?: string }).code)) {
			// The popup already handed us the very credential we need, inside the
			// error. Signing in with it needs no second window and no live click —
			// which is what makes it the right move here: the browser withdrew the
			// gesture the moment we awaited, so anything needing one is dead. The
			// anonymous account is abandoned; the teacher's real one wins.
			case 'recover-credential': {
				const credential = GoogleAuthProvider.credentialFromError(error as FirebaseError);

				if (!credential) break;

				try {
					await signInWithCredential(auth, credential);
					state.tier = 2;
					m.redraw();

					return;
				} catch (recoveryError: unknown) {
					state.signInError = 'failed';
					m.redraw();
					throw recoveryError;
				}
			}

			case 'ignore':
				return;

			case 'popup-blocked':
				// Redirect is the only path left that needs no gesture — but it
				// only completes where the auth domain IS this origin. Anywhere
				// else it ends on a signed-out page and a teacher who has no idea
				// why, so say what happened instead of staging that round trip.
				if (canCompleteRedirectSignIn()) {
					await signInWithRedirect(auth, provider);

					return;
				}
				state.signInError = 'popup-blocked';
				m.redraw();

				return;

			case 'failed':
				break;
		}

		state.signInError = 'failed';
		m.redraw();
		throw error;
	}
}

/**
 * Finish a sign-in that went the redirect route. Returns true if this page load
 * was the far side of one — harmless and cheap on every other load.
 */
export async function completeRedirectSignIn(): Promise<boolean> {
	try {
		const result = await getRedirectResult(auth);
		if (!result) return false;
		state.tier = 2;
		m.redraw();

		return true;
	} catch (error: unknown) {
		console.error('[Auth] Redirect sign-in failed:', error);
		state.signInError = 'failed';
		m.redraw();

		return false;
	}
}

/** Initialize the auth listener — call once at app start */
export function initAuth(): void {
	let authStateSettled = false;

	onAuthStateChanged(auth, (user: User | null) => {
		state.user = user;
		state.loading = false;
		state.tier = user && !user.isAnonymous ? 2 : 0;
		if (state.tier === 2) state.signInError = null;

		if (!authStateSettled) {
			authStateSettled = true;
			_resolveAuthReady();
		}

		m.redraw();
	});
}

/**
 * Dev-only scripted Google sign-in against the Auth emulator, used by
 * e2e/smoke tests where the popup flow cannot be driven. The Auth emulator
 * accepts unsigned identity claims as the credential's idToken. Never
 * shipped active: guarded by DEV mode + localhost.
 */
interface DevSignInClaims {
	sub: string;
	email: string;
	name?: string;
}

declare global {
	interface Window {
		__agoraDevSignIn?: (claims: DevSignInClaims) => Promise<void>;
	}
}

if (import.meta.env.DEV && window.location.hostname === 'localhost') {
	window.__agoraDevSignIn = async (claims: DevSignInClaims): Promise<void> => {
		const credential = GoogleAuthProvider.credential(JSON.stringify(claims));
		await signInWithCredential(auth, credential);
		m.redraw();
	};
}
