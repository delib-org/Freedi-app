import type { DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraApprovalSource,
	AgoraApprovedTeacher,
	AgoraSchool,
	AGORA_LIBRARY,
	AGORA_LIBRARY_COMMUNITY,
	Collections,
	seedTagDocs,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';
import { firstNameOf } from './libraryStrings';

/**
 * Who is an APPROVED teacher (and so may do anything a teacher does in Agora:
 * open lessons, classes and scenarios, enter the library).
 *
 * Approved = any of:
 *   - a sys-admin (`usersV2.systemAdmin`);
 *   - an explicit approval: a `grant` on the person's `agoraApprovedTeachers`
 *     marker, written when an access request is approved, when a sys-admin
 *     attaches them to a school, or by the one-time grandfather backfill
 *     (functions/scripts/backfillAgoraApprovals.ts);
 *   - attached to an ACTIVE school as teacher (`teacherMap`) or regional
 *     coordinator (`supervisorMap`) — kept so nobody a sys-admin attached is
 *     ever locked out by a missing marker. (A teacher a class teacher added by
 *     e-mail is NOT approved: any teacher can mint those; such an add files a
 *     pending access request instead.)
 *
 * Tal, 2026-10-15: a pending teacher gets NOTHING until approved, so approval
 * can no longer be derived from school attachment alone — hence the stored
 * grant. This file stays the single seam: every gate asks
 * {@link resolveApproval} (directly or through {@link requireApprovedTeacher}).
 */

export interface Approval {
	approved: boolean;
	isAdmin: boolean;
	via?: AgoraApprovalSource;
	/** Whether the rules-visible marker exists now (a gate heals a missing one) */
	hasMarker?: boolean;
}

export async function resolveApproval(uid: string): Promise<Approval> {
	const [isAdmin, markerSnap] = await Promise.all([isSystemAdmin(uid), markerRef(uid).get()]);
	const hasMarker = markerSnap.exists;
	if (isAdmin) return { approved: true, isAdmin, via: 'admin', hasMarker };
	const marker = markerSnap.data() as Partial<AgoraApprovedTeacher> | undefined;
	if (marker?.grant) return { approved: true, isAdmin, via: 'granted', hasMarker };

	const [teacherSchools, supervisorSchools] = await Promise.all([
		db.collection(Collections.agoraSchools).where(`teacherMap.${uid}`, '==', true).get(),
		db.collection(Collections.agoraSchools).where(`supervisorMap.${uid}`, '==', true).get(),
	]);
	const active = (snaps: typeof teacherSchools): boolean =>
		snaps.docs.some((snap) => (snap.data() as AgoraSchool).status === 'active');
	if (active(teacherSchools)) return { approved: true, isAdmin, via: 'school', hasMarker };
	if (active(supervisorSchools)) return { approved: true, isAdmin, via: 'supervisor', hasMarker };

	return { approved: false, isAdmin, hasMarker };
}

/** Machine-readable reason on the refusal, so a client can offer "request access" instead of an error */
export const NOT_APPROVED_REASON = 'agora-not-approved';

/**
 * The signed-in, non-anonymous caller, who must also be approved. Throws
 * otherwise (`permission-denied`, details `{ reason: NOT_APPROVED_REASON }`).
 * When the caller is approved but has no marker yet (attached before markers
 * were reliable), the marker is written so the rules-side gate
 * (`isApprovedAgoraTeacher()`) agrees with this one.
 */
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
			'Agora is for approved teachers — request access and wait for approval',
			{ reason: NOT_APPROVED_REASON },
		);
	}
	if (!approval.hasMarker) await syncApprovalMarker(uid, approval);

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

/** The same for AI covers, over a calendar day */
export function countCover(
	marker: Partial<AgoraApprovedTeacher> | undefined,
	now: number,
): Pick<AgoraApprovedTeacher, 'coversDay' | 'coversToday'> | null {
	const today = dayKey(now);
	const used = marker?.coversDay === today ? (marker.coversToday ?? 0) : 0;
	if (used >= AGORA_LIBRARY.COVERS_PER_DAY) return null;

	return { coversDay: today, coversToday: used + 1 };
}

/** The same for discussion posts, over a calendar day */
export function countPost(
	marker: Partial<AgoraApprovedTeacher> | undefined,
	now: number,
): Pick<AgoraApprovedTeacher, 'postsDay' | 'postsToday'> | null {
	const today = dayKey(now);
	const used = marker?.postsDay === today ? (marker.postsToday ?? 0) : 0;
	if (used >= AGORA_LIBRARY_COMMUNITY.POSTS_PER_DAY) return null;

	return { postsDay: today, postsToday: used + 1 };
}

/** The same for reports, over a calendar day */
export function countReport(
	marker: Partial<AgoraApprovedTeacher> | undefined,
	now: number,
): Pick<AgoraApprovedTeacher, 'reportsDay' | 'reportsToday'> | null {
	const today = dayKey(now);
	const used = marker?.reportsDay === today ? (marker.reportsToday ?? 0) : 0;
	if (used >= AGORA_LIBRARY_COMMUNITY.REPORTS_PER_DAY) return null;

	return { reportsDay: today, reportsToday: used + 1 };
}
