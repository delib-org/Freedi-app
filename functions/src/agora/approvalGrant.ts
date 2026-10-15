import {
	FieldValue,
	type DocumentData,
	type Transaction,
	type UpdateData,
} from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AgoraApprovalGrant,
	AgoraApprovalSource,
	AgoraApprovedTeacher,
	AgoraSchool,
	Collections,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';
import { markerRef, syncApprovalMarker } from './libraryAccess';

/**
 * Writing and removing an explicit approval, and the school attach / detach
 * writes it travels with. `resolveApproval` (libraryAccess.ts) is the reader;
 * this is the only writer of `grant`.
 *
 * Invariant kept here: the marker doc exists ⇔ the person is approved. The
 * rules read existence (`isApprovedAgoraTeacher()`), so a marker must never
 * outlive an approval, and an approval must always come with a marker.
 */

type SchoolUpdate = UpdateData<DocumentData>;

/** The two halves of the teacher index, moved in one write (as on a class) */
export function attachTeacherUpdate(uid: string, now: number): SchoolUpdate {
	return {
		teacherIds: FieldValue.arrayUnion(uid),
		[`teacherMap.${uid}`]: true,
		lastUpdate: now,
	};
}

export function detachTeacherUpdate(uid: string, now: number): SchoolUpdate {
	return {
		teacherIds: FieldValue.arrayRemove(uid),
		[`teacherMap.${uid}`]: FieldValue.delete(),
		lastUpdate: now,
	};
}

export function attachSupervisorUpdate(uid: string, now: number): SchoolUpdate {
	return {
		supervisorIds: FieldValue.arrayUnion(uid),
		[`supervisorMap.${uid}`]: true,
		lastUpdate: now,
	};
}

/**
 * The attachment, its index and its narrowing leave in ONE write — a scope
 * left behind would silently re-narrow a re-assigned supervisor.
 */
export function detachSupervisorUpdate(uid: string, now: number): SchoolUpdate {
	return {
		supervisorIds: FieldValue.arrayRemove(uid),
		[`supervisorMap.${uid}`]: FieldValue.delete(),
		[`supervisorScopes.${uid}`]: FieldValue.delete(),
		lastUpdate: now,
	};
}

/** The marker fields an explicit approval writes (merged: library counters survive) */
export function grantMarkerData(
	uid: string,
	grant: AgoraApprovalGrant,
	via: AgoraApprovalSource,
): Partial<AgoraApprovedTeacher> {
	return { teacherId: uid, via, checkedAt: grant.grantedAt, grant };
}

/** Record an explicit approval, inside a transaction when one is given */
export async function writeGrant(
	uid: string,
	grant: AgoraApprovalGrant,
	via: AgoraApprovalSource,
	tx?: Transaction,
): Promise<void> {
	const data = grantMarkerData(uid, grant, via);
	if (tx) {
		tx.set(markerRef(uid), data, { merge: true });

		return;
	}
	await markerRef(uid).set(data, { merge: true });
}

/** The active schools that name this person as teacher, and as coordinator */
export async function activeAttachments(
	uid: string,
): Promise<{ teacherSchoolIds: string[]; supervisorSchoolIds: string[] }> {
	const [teacherSnaps, supervisorSnaps] = await Promise.all([
		db.collection(Collections.agoraSchools).where(`teacherMap.${uid}`, '==', true).get(),
		db.collection(Collections.agoraSchools).where(`supervisorMap.${uid}`, '==', true).get(),
	]);
	const activeIds = (snaps: typeof teacherSnaps): string[] =>
		snaps.docs
			.map((snap) => snap.data() as AgoraSchool)
			.filter((school) => school.status === 'active')
			.map((school) => school.schoolId);

	return {
		teacherSchoolIds: activeIds(teacherSnaps),
		supervisorSchoolIds: activeIds(supervisorSnaps),
	};
}

/**
 * After an attachment was removed: when the person has no active attachment
 * left (and is not a sys-admin), the explicit approval goes too — the marker
 * is deleted with it. "Remove access" from someone's last school removes
 * their access, grandfathered or not. Returns whether they are still approved.
 */
export async function revokeGrantIfUnattached(uid: string): Promise<boolean> {
	const [isAdmin, attachments] = await Promise.all([isSystemAdmin(uid), activeAttachments(uid)]);
	if (isAdmin) {
		await syncApprovalMarker(uid, { approved: true, isAdmin, via: 'admin' });

		return true;
	}
	if (attachments.teacherSchoolIds.length > 0) return true;
	if (attachments.supervisorSchoolIds.length > 0) return true;
	await syncApprovalMarker(uid, { approved: false, isAdmin });

	return false;
}
