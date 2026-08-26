import { useSyncExternalStore } from 'react';
import type { User as FreediUser } from '@freedi/shared-types';
import { Collections } from '@freedi/shared-types';
import {
	auth,
	db,
	doc,
	setDoc,
	GoogleAuthProvider,
	signInWithPopup,
	signInAnonymously,
	signOut,
	onAuthStateChanged,
	User,
} from './firebase';

/**
 * Two ways aboard, and the difference matters.
 *
 * Google was the only door, and on a pre-election political questionnaire that
 * is a door many people will not walk through: it asks them to attach their
 * name to their opinions before they have been told what happens to either.
 * An anonymous voyage costs them the ability to come back on another device —
 * which is a price they can weigh, unlike a privacy question they cannot see.
 *
 * A tiny external store exposed through useUser() — same spirit as agora's
 * module-singleton state, adapted to React.
 */

export interface UserState {
	user: User | null;
	loading: boolean;
}

let state: UserState = { user: null, loading: true };
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

onAuthStateChanged(auth, (user: User | null) => {
	state = { user, loading: false };
	emit();
	// Odyssey historically wrote no users/{uid} profile, which silently starved
	// the notification email channel (it looks the address up there). A merge
	// on every sign-in keeps the doc fresh without clobbering other apps'
	// fields.
	if (user && !user.isAnonymous) {
		void setDoc(
			doc(db, Collections.users, user.uid),
			{
				uid: user.uid,
				displayName: user.displayName ?? user.email ?? 'מפליג/ה',
				email: user.email ?? null,
				lastUpdate: Date.now(),
			},
			{ merge: true },
		).catch(() => {
			// Non-blocking: the game must not care if the profile write fails.
		});
	}
});

export function useUser(): UserState {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);

			return () => listeners.delete(listener);
		},
		() => state,
	);
}

export async function signInWithGoogle(): Promise<void> {
	const provider = new GoogleAuthProvider();
	provider.setCustomParameters({ prompt: 'select_account' });
	await signInWithPopup(auth, provider);
}

/**
 * Board without an account.
 *
 * The uid is real, so everything downstream — the journey document, the
 * ratings, the handoff token into Agora — works exactly as it does for a
 * signed-in player. What is missing is any way to recover the seat: Firebase
 * keeps an anonymous uid in this browser's storage and nowhere else.
 */
export async function signInAnonymous(): Promise<void> {
	await signInAnonymously(auth);
}

export async function logOut(): Promise<void> {
	await signOut(auth);
}

/** The Freedi User object embedded on statements/evaluations as creator/evaluator. */
export function toFreediUser(user: User): FreediUser {
	return {
		uid: user.uid,
		displayName: user.displayName ?? user.email ?? 'מפליג/ה',
		email: user.email ?? null,
		photoURL: user.photoURL ?? null,
		isAnonymous: user.isAnonymous,
	};
}
