import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';

/**
 * The real person behind a `statementsSubscribe` doc, as stored in its `user`
 * field. Subscriptions are readable by every signed-in user, so this holds the
 * minimum a member list needs and never an email or any other personal field.
 */
export interface PersonIdentity {
	uid: string;
	displayName: string;
	photoURL?: string;
}

/** The part of firebase-admin's Auth used here; a root script holds another installed copy of it. */
export interface AuthUsers {
	getUsers(identifiers: Array<{ uid: string }>): Promise<{
		users: Array<{ uid: string; displayName?: string; photoURL?: string }>;
	}>;
}

/** Firebase Auth refuses more identifiers than this in one getUsers call. */
const AUTH_GET_USERS_LIMIT = 100;

export interface LookupOptions {
	/**
	 * Without it an Auth failure rejects, so a backfill stops rather than storing
	 * a blank name it could have found. With it the lookup goes on with what
	 * usersV2 gave.
	 */
	onAuthFailure?: (error: unknown) => void;
}

/** For a person with no profile: valid against UserSchema, and nobody else's identity. */
export function neutralIdentity(uid: string): PersonIdentity {
	return { uid, displayName: '' };
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function identityOf(uid: string, displayName: string, photoURL: string): PersonIdentity {
	return { uid, displayName, ...(photoURL ? { photoURL } : {}) };
}

async function readAuthProfiles(
	auth: AuthUsers,
	uids: string[],
): Promise<Map<string, PersonIdentity>> {
	const found = new Map<string, PersonIdentity>();
	for (let i = 0; i < uids.length; i += AUTH_GET_USERS_LIMIT) {
		const chunk = uids.slice(i, i + AUTH_GET_USERS_LIMIT);
		const { users } = await auth.getUsers(chunk.map((uid) => ({ uid })));
		users.forEach((user) => {
			found.set(user.uid, identityOf(user.uid, text(user.displayName), text(user.photoURL)));
		});
	}

	return found;
}

/**
 * Identities of `uids` from usersV2, asking Firebase Auth only about those it
 * has no name for. A uid known to neither is absent from the result.
 */
export async function lookupPersonIdentities(
	firestore: Firestore,
	auth: AuthUsers,
	uids: ReadonlyArray<string>,
	{ onAuthFailure }: LookupOptions = {},
): Promise<Map<string, PersonIdentity>> {
	const unique = [...new Set(uids)];
	const found = new Map<string, PersonIdentity>();
	if (unique.length === 0) return found;

	const usersRef = firestore.collection(Collections.users);
	const snaps = await firestore.getAll(...unique.map((uid) => usersRef.doc(uid)));
	snaps.forEach((snap, index) => {
		if (!snap.exists) return;
		const data = snap.data();
		const uid = unique[index];
		found.set(uid, identityOf(uid, text(data?.displayName), text(data?.photoURL)));
	});

	const nameless = unique.filter((uid) => !found.get(uid)?.displayName);
	if (nameless.length === 0) return found;

	try {
		const fromAuth = await readAuthProfiles(auth, nameless);
		fromAuth.forEach((identity, uid) => {
			const photoURL = found.get(uid)?.photoURL ?? identity.photoURL ?? '';
			found.set(uid, identityOf(uid, identity.displayName, photoURL));
		});
	} catch (error) {
		if (!onAuthFailure) throw error;
		onAuthFailure(error);
	}

	return found;
}
