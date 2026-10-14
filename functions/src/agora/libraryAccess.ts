import type { DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraApprovalSource,
	AgoraApprovedTeacher,
	AgoraSchool,
	AGORA_LIBRARY,
	Collections,
	seedTagDocs,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';
import { firstNameOf } from './libraryStrings';

/**
 * Who is an APPROVED teacher.
 *
 * Today there is no explicit "approved" flag on a user: a sys-admin vets a
 * teacher by attaching them to an ACTIVE school (`agoraSchools.teacherMap`),
 * by naming them one of its supervisors (`supervisorMap`), or by being a
 * sys-admin themselves. That admin-granted attachment is what "approved" means
 * for the library. (A teacher a class teacher added by e-mail is NOT approved:
 * any teacher can mint those, so they prove nothing.)
 *
 * This file is the single seam: when Studio gains an explicit approval step,
 * {@link resolveApproval} learns about it and nothing else changes.
 */

export interface Approval {
	approved: boolean;
	isAdmin: boolean;
	via?: AgoraApprovalSource;
}

export async function resolveApproval(uid: string): Promise<Approval> {
	const isAdmin = await isSystemAdmin(uid);
	if (isAdmin) return { approved: true, isAdmin, via: 'admin' };

	const [teacherSchools, supervisorSchools] = await Promise.all([
		db.collection(Collections.agoraSchools).where(`teacherMap.${uid}`, '==', true).get(),
		db.collection(Collections.agoraSchools).where(`supervisorMap.${uid}`, '==', true).get(),
	]);
	const active = (snaps: typeof teacherSchools): boolean =>
		snaps.docs.some((snap) => (snap.data() as AgoraSchool).status === 'active');
	if (active(teacherSchools)) return { approved: true, isAdmin, via: 'school' };
	if (active(supervisorSchools)) return { approved: true, isAdmin, via: 'supervisor' };

	return { approved: false, isAdmin };
}

/** The signed-in, non-anonymous caller, who must also be approved. Throws otherwise. */
export async function requireApprovedTeacher(
	request: CallableRequest<unknown>,
): Promise<{ uid: string; approval: Approval }> {
	const uid = request.auth?.uid;
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}
	if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
		throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
	}
	const approval = await resolveApproval(uid);
	if (!approval.approved) {
		throw new HttpsError(
			'permission-denied',
			'The scenario library is for approved teachers — ask your admin to attach you to a school',
		);
	}

	return { uid, approval };
}

export function markerRef(uid: string): DocumentReference {
	return db.collection(Collections.agoraApprovedTeachers).doc(uid);
}

/**
 * Bring the rules-visible marker in line with the live answer: written when
 * approved (counters kept), deleted when not. Returns the marker's new state.
 */
export async function syncApprovalMarker(uid: string, approval: Approval): Promise<void> {
	const ref = markerRef(uid);
	if (!approval.approved || !approval.via) {
		await ref.delete();

		return;
	}
	await ref.set(
		{
			teacherId: uid,
			via: approval.via,
			checkedAt: Date.now(),
		} satisfies Partial<AgoraApprovedTeacher>,
		{ merge: true },
	);
}

/** Create the starting vocabulary if it is not there yet (idempotent, one read when it is) */
export async function ensureSeedTags(): Promise<void> {
	const seeds = seedTagDocs(Date.now());
	const refs = seeds.map((seed) => db.collection(Collections.agoraLibraryTags).doc(seed.tagId));
	const snaps = await db.getAll(...refs);
	const batch = db.batch();
	let writes = 0;
	snaps.forEach((snap, index) => {
		if (snap.exists) return;
		batch.set(refs[index], seeds[index]);
		writes++;
	});
	if (writes > 0) await batch.commit();
}

/** The name a teacher is shown to others by: first name only, never an e-mail */
export async function authorNameOf(uid: string): Promise<string> {
	const snap = await db.collection(Collections.users).doc(uid).get();
	const data = snap.data() as { displayName?: unknown } | undefined;
	const first = firstNameOf(data?.displayName);

	return first;
}

/** Days are UTC calendar days, weeks rolling seven days: the limits need no query */
export function dayKey(now: number): string {
	return new Date(now).toISOString().slice(0, 10);
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The marker after a copy is counted against today's allowance, or null when the day is used up */
export function countCopy(
	marker: Partial<AgoraApprovedTeacher> | undefined,
	now: number,
): Pick<AgoraApprovedTeacher, 'copiesDay' | 'copiesToday'> | null {
	const today = dayKey(now);
	const used = marker?.copiesDay === today ? (marker.copiesToday ?? 0) : 0;
	if (used >= AGORA_LIBRARY.COPIES_PER_DAY) return null;

	return { copiesDay: today, copiesToday: used + 1 };
}

/** The same for new tags, over a rolling week */
export function countTag(
	marker: Partial<AgoraApprovedTeacher> | undefined,
	now: number,
): Pick<AgoraApprovedTeacher, 'tagsWeekStart' | 'tagsThisWeek'> | null {
	const fresh = marker?.tagsWeekStart !== undefined && now - marker.tagsWeekStart < WEEK_MS;
	const used = fresh ? (marker?.tagsThisWeek ?? 0) : 0;
	if (used >= AGORA_LIBRARY.TAGS_PER_WEEK) return null;

	return { tagsWeekStart: fresh ? (marker?.tagsWeekStart ?? now) : now, tagsThisWeek: used + 1 };
}
