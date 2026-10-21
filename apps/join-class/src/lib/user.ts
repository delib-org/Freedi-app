import m from 'mithril';
import { signOut as fbSignOut } from 'firebase/auth';
import {
	auth,
	signInAnonymously,
	GoogleAuthProvider,
	signInWithPopup,
	linkWithPopup,
	onAuthStateChanged,
	User,
} from './firebase';

export type IdentityTier = 0 | 1 | 2;

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

export function getUserState(): Readonly<UserState> {
	return state;
}

export function waitForAuthReady(): Promise<void> {
	return authReadyPromise;
}

export async function ensureUser(): Promise<User> {
	await waitForAuthReady();

	if (auth.currentUser) {
		return auth.currentUser;
	}

	const credential = await signInAnonymously(auth);

	return credential.user;
}

/** Explicit guest sign-in for the login page. Mirrors the auto path used by
 *  public share routes via `ensureUser()`, but is initiated by the user via
 *  a "Continue as guest" CTA so it counts as an explicit choice. */
export async function signInAsGuest(): Promise<User> {
	await waitForAuthReady();
	if (auth.currentUser) return auth.currentUser;
	const credential = await signInAnonymously(auth);

	return credential.user;
}

export async function signOut(): Promise<void> {
	await fbSignOut(auth);
	state.user = null;
	state.tier = 0;
	m.redraw();
}

/** True once auth has settled and a real user exists. Used by the route
 *  guard to decide whether to redirect to /login. Anonymous users count as
 *  signed-in here — the login page simply offers Guest as one of the two
 *  paths, so once they pick it they're authenticated. */
export function isSignedIn(): boolean {
	return state.user !== null;
}

export async function signInWithGoogle(): Promise<void> {
	if (state.tier === 2) return;

	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });

	const currentUser = auth.currentUser;

	if (currentUser && currentUser.isAnonymous) {
		try {
			await linkWithPopup(currentUser, provider);
			state.tier = 2;
			m.redraw();
		} catch (error: unknown) {
			const firebaseError = error as { code?: string };
			if (firebaseError.code === 'auth/credential-already-in-use') {
				await signInWithPopup(auth, provider);
				state.tier = 2;
				m.redraw();
			} else {
				throw error;
			}
		}
	} else {
		await signInWithPopup(auth, provider);
		state.tier = 2;
		m.redraw();
	}
}

export function initAuth(): void {
	let authStateSettled = false;

	onAuthStateChanged(auth, (user: User | null) => {
		state.user = user;
		state.loading = false;

		if (user) {
			state.tier = user.isAnonymous ? 0 : 2;
		} else {
			state.tier = 0;
		}

		if (!authStateSettled) {
			authStateSettled = true;
			_resolveAuthReady();
		}

		m.redraw();
	});
}
