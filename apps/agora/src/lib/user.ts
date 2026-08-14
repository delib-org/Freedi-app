import m from 'mithril';
import {
	auth,
	signInAnonymously,
	signInWithCredential,
	GoogleAuthProvider,
	signInWithPopup,
	signInWithRedirect,
	getRedirectResult,
	linkWithPopup,
	onAuthStateChanged,
	User,
} from './firebase';

/**
 * Identity tiers:
 * 0 = Anonymous student/team (real Firebase anon uid — rules and triggers work)
 * 2 = Google Auth (teachers)
 */
export type IdentityTier = 0 | 2;

export interface UserState {
	user: User | null;
	tier: IdentityTier;
	loading: boolean;
}

const state: UserState = {
	user: null,
	tier: 0,
	loading: true,
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
 * Teacher sign-in with Google. Links an anonymous account when one exists
 * so a teacher who first explored as a student keeps their uid.
 */
export async function signInWithGoogle(): Promise<void> {
	if (state.tier === 2) return;

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
		const code = (error as { code?: string }).code;

		// A popup may only be opened while the click that asked for it is still
		// "live". Both remaining paths here run AFTER an await — the second
		// attempt when an anonymous account turns out to be already linked, and
		// any retry after a failure — so the browser has already withdrawn the
		// user gesture and blocks them. That is what auth/popup-blocked was.
		//
		// Redirect needs no gesture. It costs a page load, which is why it is
		// the fallback rather than the default, and getRedirectResult() below
		// finishes the job when we come back.
		if (
			code === 'auth/credential-already-in-use' ||
			code === 'auth/popup-blocked' ||
			code === 'auth/cancelled-popup-request'
		) {
			await signInWithRedirect(auth, provider);

			return;
		}
		// A teacher who closes the popup themselves has not failed at anything
		if (code === 'auth/popup-closed-by-user') return;
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
