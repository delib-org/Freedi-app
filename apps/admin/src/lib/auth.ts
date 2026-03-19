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
		m.redraw();
	} catch (error) {
		console.error('[Auth] Sign-out failed:', error);
	}
}

export function getAuthState(): Readonly<AuthState> {
	return state;
}
