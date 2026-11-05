import {
	GoogleAuthProvider,
	signInAnonymously,
	signInWithPopup,
	onAuthStateChanged,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { logError } from '@freedi/shared-utils';
import { auth } from '@/lib/firebase';

/**
 * Identity in Tables. Hosts sign in with Google; participants never do:
 * they get a Firebase anonymous user and identify with a full name only.
 */

let authReady: Promise<User | null> | null = null;

/** Resolves once Firebase has restored (or not) the previous session. */
export function waitForAuthReady(): Promise<User | null> {
	if (!authReady) {
		authReady = new Promise((resolve) => {
			const unsubscribe = onAuthStateChanged(auth, (user) => {
				unsubscribe();
				resolve(user);
			});
		});
	}

	return authReady;
}

/** A host is a signed-in user with a Google provider (anonymous users are participants). */
export function isGoogleUser(user: User | null): boolean {
	return !!user && !user.isAnonymous;
}

export async function signInHostWithGoogle(): Promise<User> {
	try {
		const credential = await signInWithPopup(auth, new GoogleAuthProvider());

		return credential.user;
	} catch (error) {
		logError(error, { operation: 'tables.auth.signInHostWithGoogle' });
		throw error;
	}
}

/** The in-flight anonymous sign-in, shared by concurrent callers. */
let anonymousSignIn: Promise<User> | null = null;

/** The participant's identity: the current user, or a fresh anonymous one (single-flight). */
export async function ensureParticipantUser(): Promise<User> {
	await waitForAuthReady();

	// Intended: a signed-in (non-anonymous) host keeps their own user, so a host can test as a participant.
	if (auth.currentUser) return auth.currentUser;

	if (!anonymousSignIn) {
		anonymousSignIn = signInAnonymously(auth)
			.then((credential) => credential.user)
			.catch((error: unknown) => {
				logError(error, { operation: 'tables.auth.ensureParticipantUser' });
				throw error;
			})
			.finally(() => {
				anonymousSignIn = null;
			});
	}

	return anonymousSignIn;
}
