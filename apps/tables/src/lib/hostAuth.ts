import m from 'mithril';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { logError } from '@freedi/shared-utils';
import { auth } from '@/lib/firebase';
import { isGoogleUser, signInHostWithGoogle } from '@/lib/auth';

/**
 * Reactive host identity. `checking` until Firebase restores the previous
 * session, then `signedOut` (no user, or an anonymous participant identity)
 * or `signedIn` (a Google user).
 */
export type HostAuthStatus = 'checking' | 'signedOut' | 'signedIn';

export interface HostAuthState {
	status: HostAuthStatus;
	user: User | null;
	signInFailed: boolean;
}

export const hostAuth: HostAuthState = { status: 'checking', user: null, signInFailed: false };

let started = false;

export function startHostAuth(): void {
	if (started) return;
	started = true;

	onAuthStateChanged(auth, (user) => {
		hostAuth.user = isGoogleUser(user) ? user : null;
		hostAuth.status = hostAuth.user ? 'signedIn' : 'signedOut';
		m.redraw();
	});
}

export async function signInHost(): Promise<void> {
	hostAuth.signInFailed = false;

	try {
		const user = await signInHostWithGoogle();

		// Linking an anonymous user does not fire onAuthStateChanged: set the identity here.
		hostAuth.user = user;
		hostAuth.status = 'signedIn';
	} catch (error) {
		logError(error, { operation: 'tables.hostAuth.signIn' });
		hostAuth.signInFailed = true;
	}
	m.redraw();
}

/** Ends the host's session. The auth listener then shows the sign-in gate, which drops the signed-in frame and its reads. */
export async function signOutHost(): Promise<void> {
	try {
		await signOut(auth);
	} catch (error) {
		logError(error, { operation: 'tables.hostAuth.signOut' });
	}
	m.redraw();
}
