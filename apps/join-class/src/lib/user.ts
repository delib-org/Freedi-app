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

export async function signOut(): Promise<void> {
	await fbSignOut(auth);
	state.user = null;
	state.tier = 0;
	m.redraw();
}

/** True once auth has settled and any user (anonymous included) exists. */
export function isSignedIn(): boolean {
	return state.user !== null;
}

export interface GoogleSignInOptions {
	/**
	 * Keep the current anonymous account (and the lessons it owns) by linking
	 * Google to it. False replaces the anonymous account with the Google one, so
	 * a student's anonymous identity on a shared computer never becomes a
	 * teacher's. Decided BEFORE the click (ownsClassLessons) so the popup opens
	 * inside the user gesture, with no network wait in between.
	 */
	linkAnonymous: boolean;
}

export async function signInWithGoogle(options: GoogleSignInOptions): Promise<void> {
	if (state.tier === 2) return;

	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });

	const currentUser = auth.currentUser;

	if (options.linkAnonymous && currentUser && currentUser.isAnonymous) {
		try {
			await linkWithPopup(currentUser, provider);
		} catch (error: unknown) {
			const firebaseError = error as { code?: string };
			if (firebaseError.code !== 'auth/credential-already-in-use') throw error;
			// This Google account already exists elsewhere: sign into it.
			await signInWithPopup(auth, provider);
		}
	} else {
		await signInWithPopup(auth, provider);
	}
	state.tier = 2;
	m.redraw();
}

/** True for a Google-signed-in account: a teacher. Students are always anonymous. */
export function isGoogleSignedIn(): boolean {
	return state.user !== null && !state.user.isAnonymous;
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
