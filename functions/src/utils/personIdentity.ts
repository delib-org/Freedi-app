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
	isAnonymous: boolean;
}

/** The part of firebase-admin's Auth used here; a root script holds another installed copy of it. */
export interface AuthUsers {
	getUsers(identifiers: Array<{ uid: string }>): Promise<{
		users: Array<{
			uid: string;
			displayName?: string;
			photoURL?: string;
			providerData?: ReadonlyArray<unknown>;
		}>;
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

/**
 * When nothing proves an account, the person counts as anonymous. That is the
 * default every reader of this flag already applies (`?? true`), and no reader
 * hides anyone because of it, so a host with no profile still appears, nameless.
 */
const ANONYMOUS_WHEN_UNKNOWN = true;

/** For a person with no profile: valid against UserSchema, and nobody else's identity. */
export function neutralIdentity(uid: string): PersonIdentity {
	return { uid, displayName: '', isAnonymous: ANONYMOUS_WHEN_UNKNOWN };
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

interface ProfileParts {
	displayName: string;
	photoURL: string;
	/** undefined: this source cannot tell. */
	isAnonymous: boolean | undefined;
}

/**
 * What usersV2 can say about anonymity. The client writes `isAnonymous: true` when
 * the doc is first created and never clears it, so a `true` may be stale after an
 * anonymous account is linked: only Auth settles it. An email, which is read here
 * and never stored, proves an account, and keeps Auth out of the common case on
 * this hot path.
 */
export function anonymityFromProfile(data: {
	isAnonymous?: unknown;
	email?: unknown;
}): boolean | undefined {
	if (data.isAnonymous === false) return false;
	if (data.isAnonymous === true) return undefined;

	return text(data.email) ? false : undefined;
}

/** Firebase Auth's own record: an account with no linked provider is anonymous. */
export function anonymityFromAuth(providerData: ReadonlyArray<unknown> | undefined): boolean {
	return (providerData?.length ?? 0) === 0;
}

async function readAuthProfiles(
	auth: AuthUsers,
	uids: string[],
): Promise<Map<string, ProfileParts>> {
	const found = new Map<string, ProfileParts>();
	for (let i = 0; i < uids.length; i += AUTH_GET_USERS_LIMIT) {
		const chunk = uids.slice(i, i + AUTH_GET_USERS_LIMIT);
		const { users } = await auth.getUsers(chunk.map((uid) => ({ uid })));
		users.forEach((user) => {
			found.set(user.uid, {
				displayName: text(user.displayName),
				photoURL: text(user.photoURL),
				isAnonymous: anonymityFromAuth(user.providerData),
			});
		});
	}

	return found;
}

/**
 * Identities of `uids` from usersV2, asking Firebase Auth only about those whose
 * name or anonymity it cannot settle. A uid known to neither is absent from the
 * result. When Auth cannot settle it, the person counts as anonymous.
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
	const profiles = new Map<string, ProfileParts>();
	snaps.forEach((snap, index) => {
		if (!snap.exists) return;
		const data = snap.data() ?? {};
		const uid = unique[index];
		profiles.set(uid, {
			displayName: text(data.displayName),
			photoURL: text(data.photoURL),
			isAnonymous: anonymityFromProfile(data),
		});
	});

	const unsettled = unique.filter((uid) => {
		const profile = profiles.get(uid);

		return !profile?.displayName || profile.isAnonymous === undefined;
	});
	let fromAuth = new Map<string, ProfileParts>();
	if (unsettled.length > 0) {
		try {
			fromAuth = await readAuthProfiles(auth, unsettled);
		} catch (error) {
			if (!onAuthFailure) throw error;
			onAuthFailure(error);
		}
	}

	unique.forEach((uid) => {
		const profile = profiles.get(uid);
		const account = fromAuth.get(uid);
		if (!profile && !account) return;
		const photoURL = profile?.photoURL || account?.photoURL;
		found.set(uid, {
			uid,
			displayName: profile?.displayName || account?.displayName || '',
			...(photoURL ? { photoURL } : {}),
			isAnonymous: account?.isAnonymous ?? profile?.isAnonymous ?? ANONYMOUS_WHEN_UNKNOWN,
		});
	});

	return found;
}
