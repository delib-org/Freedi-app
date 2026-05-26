import m from 'mithril';
import {
	auth,
	db,
	doc,
	getDoc,
	GoogleAuthProvider,
	signInWithPopup,
	onAuthStateChanged,
} from './firebase';
import type { User } from './firebase';
import { Collections } from '@freedi/shared-types';

interface AuthState {
	user: User | null;
	loading: boolean;
	isAdmin: boolean;
}

const state: AuthState = {
	user: null,
	loading: true,
	isAdmin: false,
};

type AuthListener = (state: Readonly<AuthState>) => void;
const listeners = new Set<AuthListener>();

function notify(): void {
	for (const listener of listeners) listener(state);
}

export function initAuth(): void {
	onAuthStateChanged(auth, async (user) => {
		state.user = user;

		if (user) {
			try {
				const userDocRef = doc(db, Collections.users, user.uid);
				const userDoc = await getDoc(userDocRef);

				if (userDoc.exists()) {
					const data = userDoc.data();
					state.isAdmin = data?.systemAdmin === true;
				} else {
					state.isAdmin = false;
				}
			} catch (error) {
				console.error('[Auth] Failed to check admin status:', error);
				state.isAdmin = false;
			}
		} else {
			state.isAdmin = false;
		}

		state.loading = false;
		notify();
		m.redraw();
	});
}

export async function signIn(): Promise<void> {
	try {
		const provider = new GoogleAuthProvider();
		await signInWithPopup(auth, provider);
	} catch (error) {
		console.error('[Auth] Sign-in failed:', error);
	}
}

export async function signOutUser(): Promise<void> {
	try {
		await auth.signOut();
		state.user = null;
		state.isAdmin = false;
		notify();
		m.redraw();
	} catch (error) {
		console.error('[Auth] Sign-out failed:', error);
	}
}

export function getAuthState(): Readonly<AuthState> {
	return state;
}

/**
 * Subscribe to auth state changes. Fires immediately with the current state
 * and again on every change. Returns an unsubscribe function.
 */
export function onAuthChange(listener: AuthListener): () => void {
	listeners.add(listener);
	listener(state);

	return () => {
		listeners.delete(listener);
	};
}

/**
 * Run `onReady` once the user is a confirmed, authenticated admin, and run
 * `onLost` if that status is later revoked (sign-out / non-admin). Gates
 * Firestore access so queries never fire before the async session restores
 * (otherwise request.auth is null and every rule denies the read).
 */
export function whenAdmin(onReady: () => void, options?: { onLost?: () => void }): () => void {
	let active = false;

	return onAuthChange((current) => {
		const ready = !current.loading && current.user !== null && current.isAdmin;
		if (ready && !active) {
			active = true;
			onReady();
		} else if (!ready && active) {
			active = false;
			options?.onLost?.();
		}
	});
}
