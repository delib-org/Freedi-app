/**
 * Teachers are named by their sign-in account, never by an email stored in an
 * agora document. Both lookups here go through `usersV2` server-side: the
 * client sends an email and gets a uid back, or sends a uid and gets a name
 * it may print — the email itself never leaves this module.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import { Collections } from '@freedi/shared-types';

/** Resolve a teacher's sign-in email to a uid, or refuse loudly. */
export async function resolveTeacherUid(teacherEmail: string): Promise<string> {
	const email = teacherEmail.trim().toLowerCase();
	if (!email) {
		throw new HttpsError('invalid-argument', 'teacherEmail is required');
	}
	const snap = await db.collection(Collections.users).where('email', '==', email).limit(1).get();
	if (snap.empty) {
		throw new HttpsError(
			'not-found',
			'No account with that email — the teacher must sign in to Agora with Google once first',
		);
	}

	return snap.docs[0].id;
}

/**
 * A name a co-teacher may see: the display name, else the masked mailbox
 * ("t…r@school.org"), else the first characters of the uid. Pure so it can be
 * tested; `teacherDisplayNames` feeds it.
 */
export function displayNameOf(
	uid: string,
	user: { displayName?: unknown; email?: unknown } | undefined,
): string {
	const displayName = typeof user?.displayName === 'string' ? user.displayName.trim() : '';
	if (displayName) return displayName;
	const email = typeof user?.email === 'string' ? user.email.trim() : '';
	const at = email.indexOf('@');
	if (at > 0) {
		const box = email.slice(0, at);
		const masked = box.length <= 2 ? `${box[0]}…` : `${box[0]}…${box[box.length - 1]}`;

		return `${masked}${email.slice(at)}`;
	}

	return uid.slice(0, 6);
}

/** Display names for a list of teacher uids, in the same order. */
export async function teacherDisplayNames(
	uids: readonly string[],
): Promise<Array<{ uid: string; name: string }>> {
	const snaps = await Promise.all(
		uids.map((uid) => db.collection(Collections.users).doc(uid).get()),
	);

	return uids.map((uid, index) => ({
		uid,
		name: displayNameOf(uid, snaps[index].data() as { displayName?: unknown; email?: unknown }),
	}));
}
