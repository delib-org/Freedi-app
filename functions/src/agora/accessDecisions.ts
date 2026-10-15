import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AGORA_ACCESS,
	AgoraAccessActor,
	AgoraAccessRequest,
	AgoraAccessRole,
	AgoraApprovalSource,
	AgoraSchool,
	Collections,
	ManageAccessResponse,
	canDecideAccessRequest,
	canRemoveAccess,
	canSeeAccessRequest,
	isTeacherInScope,
	resolveSupervisorScope,
} from '@freedi/shared-types';
import {
	attachSupervisorUpdate,
	attachTeacherUpdate,
	detachSupervisorUpdate,
	detachTeacherUpdate,
	revokeGrantIfUnattached,
	writeGrant,
} from './approvalGrant';
import { cleanId, cleanText, requestsCollection } from './accessRequests';
import { sendDecisionEmail } from './accessEmail';

/**
 * The three decisions of `agoraManageAccess`: approve, decline, remove.
 * Permission is decided by the pure rules in shared-types `agoraAccess.ts`;
 * this file adds the reads and the writes, each decision in one transaction.
 */

function schoolRef(schoolId: string): DocumentReference {
	return db.collection(Collections.agoraSchools).doc(schoolId);
}

/** A request the actor may not see answers exactly like a missing one */
function requireVisible(
	actor: AgoraAccessActor,
	request: AgoraAccessRequest | undefined,
): AgoraAccessRequest {
	if (!request || !canSeeAccessRequest(actor, request)) {
		throw new HttpsError('not-found', 'Request not found');
	}

	return request;
}

function requireDecidable(actor: AgoraAccessActor, request: AgoraAccessRequest): void {
	if (request.status !== 'pending') {
		throw new HttpsError('failed-precondition', 'This request was already decided');
	}
	if (!canDecideAccessRequest(actor, request)) {
		throw new HttpsError('permission-denied', 'You may not decide this request');
	}
}

/** The schools an approval attaches the person to, by role and by who approves */
function targetSchoolIds(
	actor: AgoraAccessActor,
	request: AgoraAccessRequest,
	schoolId: unknown,
	schoolIds: unknown,
): string[] {
	if (request.role === 'supervisor') {
		if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
			throw new HttpsError(
				'invalid-argument',
				'Pick at least one school for a regional coordinator',
			);
		}
		if (schoolIds.length > AGORA_ACCESS.MAX_GRANTED_SCHOOLS) {
			throw new HttpsError('invalid-argument', 'Too many schools');
		}

		return [...new Set(schoolIds.map((id) => cleanId(id, 'schoolIds')))];
	}
	if (schoolId === undefined || schoolId === null) {
		return request.schoolId ? [request.schoolId] : [];
	}
	const picked = cleanId(schoolId, 'schoolId');
	// Only a sys-admin re-homes a request; a coordinator approves for the school asked for
	if (!actor.isAdmin && picked !== request.schoolId) {
		throw new HttpsError('permission-denied', 'You may approve only for the requested school');
	}

	return [picked];
}

export async function approveRequest(
	actor: AgoraAccessActor,
	rawRequestId: unknown,
	schoolId: unknown,
	schoolIds: unknown,
): Promise<ManageAccessResponse> {
	const requestId = cleanId(rawRequestId, 'requestId');
	const ref = requestsCollection().doc(requestId);

	const approved = await db.runTransaction(async (tx) => {
		const request = requireVisible(
			actor,
			(await tx.get(ref)).data() as AgoraAccessRequest | undefined,
		);
		requireDecidable(actor, request);
		const targets = targetSchoolIds(actor, request, schoolId, schoolIds);
		const schoolSnaps = targets.length ? await tx.getAll(...targets.map(schoolRef)) : [];
		const schools = schoolSnaps.map((snap) => snap.data() as AgoraSchool | undefined);
		if (schools.some((school) => !school || school.status !== 'active')) {
			throw new HttpsError('not-found', 'School not found or closed');
		}

		const now = Date.now();
		schools.forEach((school, index) => {
			if (!school) return;
			const update =
				request.role === 'teacher'
					? attachTeacherUpdate(request.uid, now)
					: attachSupervisorUpdate(request.uid, now);
			// A narrowed coordinator's approvals join their own scope (spec §6)
			const scope = actor.isAdmin ? null : resolveSupervisorScope(school, actor.uid, false);
			if (scope?.kind === 'teachers') {
				update[`supervisorScopes.${actor.uid}.teacherIds`] = FieldValue.arrayUnion(request.uid);
			}
			tx.update(schoolSnaps[index].ref, update);
		});

		const via: AgoraApprovalSource =
			targets.length === 0 ? 'granted' : request.role === 'teacher' ? 'school' : 'supervisor';
		await writeGrant(
			request.uid,
			{ source: 'request', grantedAt: now, grantedBy: actor.uid, requestId },
			via,
			tx,
		);
		tx.update(ref, {
			status: 'approved',
			grantedSchoolIds: targets,
			decidedBy: actor.uid,
			decidedVia: actor.isAdmin ? 'admin' : 'supervisor',
			decidedAt: now,
			lastUpdate: now,
		});

		return { request, targets };
	});

	await sendDecisionEmail(approved.request, 'approved');

	return {
		action: 'approve',
		requestId,
		status: 'approved',
		grantedSchoolIds: approved.targets,
	};
}

export async function declineRequest(
	actor: AgoraAccessActor,
	rawRequestId: unknown,
	rawReason: unknown,
): Promise<ManageAccessResponse> {
	const requestId = cleanId(rawRequestId, 'requestId');
	const reason = cleanText(rawReason, AGORA_ACCESS.MAX_REASON_LENGTH, 'reason');
	const ref = requestsCollection().doc(requestId);

	const declined = await db.runTransaction(async (tx) => {
		const request = requireVisible(
			actor,
			(await tx.get(ref)).data() as AgoraAccessRequest | undefined,
		);
		requireDecidable(actor, request);
		const now = Date.now();
		tx.update(ref, {
			status: 'declined',
			decidedBy: actor.uid,
			decidedVia: actor.isAdmin ? 'admin' : 'supervisor',
			decidedAt: now,
			...(reason ? { declineReason: reason } : {}),
			lastUpdate: now,
		});

		return request;
	});

	await sendDecisionEmail(declined, 'declined', reason);

	return { action: 'decline', requestId, status: 'declined' };
}

function cleanRole(value: unknown): AgoraAccessRole {
	if (value !== 'teacher' && value !== 'supervisor') {
		throw new HttpsError('invalid-argument', 'role must be teacher or supervisor');
	}

	return value;
}

/**
 * Remove access. With a school: that one attachment (the target must hold it
 * there). Without (sys-admin only): every attachment, both roles. Either way,
 * a person left with no active attachment loses their explicit approval too.
 */
export async function removeAccess(
	actor: AgoraAccessActor,
	rawUid: unknown,
	rawRole: unknown,
	rawSchoolId: unknown,
): Promise<ManageAccessResponse> {
	const uid = cleanId(rawUid, 'uid');
	const role = cleanRole(rawRole);
	const now = Date.now();
	const removedFromSchoolIds: string[] = [];

	if (rawSchoolId === undefined || rawSchoolId === null) {
		if (!actor.isAdmin) {
			throw new HttpsError('permission-denied', 'Name the school to remove access from');
		}
		const [teacherSnaps, supervisorSnaps] = await Promise.all([
			db.collection(Collections.agoraSchools).where(`teacherMap.${uid}`, '==', true).get(),
			db.collection(Collections.agoraSchools).where(`supervisorMap.${uid}`, '==', true).get(),
		]);
		const batch = db.batch();
		teacherSnaps.docs.forEach((snap) => batch.update(snap.ref, detachTeacherUpdate(uid, now)));
		supervisorSnaps.docs.forEach((snap) =>
			batch.update(snap.ref, detachSupervisorUpdate(uid, now)),
		);
		await batch.commit();
		removedFromSchoolIds.push(
			...new Set([...teacherSnaps.docs, ...supervisorSnaps.docs].map((snap) => snap.id)),
		);
	} else {
		const schoolId = cleanId(rawSchoolId, 'schoolId');
		await db.runTransaction(async (tx) => {
			const snap = await tx.get(schoolRef(schoolId));
			const school = snap.data() as AgoraSchool | undefined;
			if (!school) throw new HttpsError('not-found', 'School not found');
			const scope = actor.isAdmin ? null : resolveSupervisorScope(school, actor.uid, false);
			const inScope = scope !== null && isTeacherInScope(scope, uid);
			if (!canRemoveAccess(actor, { uid, role, schoolId }, inScope)) {
				throw new HttpsError('permission-denied', 'You may not remove this access');
			}
			const holds =
				role === 'teacher'
					? school.teacherMap?.[uid] === true
					: school.supervisorMap?.[uid] === true;
			if (!holds) throw new HttpsError('not-found', 'No such access at this school');
			tx.update(
				snap.ref,
				role === 'teacher' ? detachTeacherUpdate(uid, now) : detachSupervisorUpdate(uid, now),
			);
		});
		removedFromSchoolIds.push(schoolId);
	}

	const stillApproved = await revokeGrantIfUnattached(uid);

	return { action: 'remove', uid, removedFromSchoolIds, stillApproved };
}
