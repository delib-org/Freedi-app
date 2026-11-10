import {
	GoogleAuthProvider,
	linkWithPopup,
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

/** Firebase's code when the Google account already belongs to another user. */
const CREDENTIAL_IN_USE = 'auth/credential-already-in-use';

function isCredentialInUse(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === CREDENTIAL_IN_USE
	);
}

/**
 * Google sign-in. An anonymous user (a participant who is now hosting) is linked to the
 * Google account, which keeps the uid and so their registration. Only when that account
 * already exists as another user does it sign in to that one instead.
 */
export async function signInHostWithGoogle(): Promise<User> {
	const provider = new GoogleAuthProvider();
	const current = auth.currentUser;

	try {
		if (current?.isAnonymous) {
			try {
				return (await linkWithPopup(current, provider)).user;
			} catch (error) {
				if (!isCredentialInUse(error)) throw error;
			}
		}

		return (await signInWithPopup(auth, provider)).user;
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
