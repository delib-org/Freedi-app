import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import type { Query } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AGORA_ACCESS,
	AccessSchoolOption,
	AgoraAccessActor,
	AgoraAccessRequest,
	AgoraAccessStatus,
	AgoraAccessStatusSchema,
	AgoraSchool,
	Collections,
	ManageAccessRequest,
	ManageAccessResponse,
	canDecideAccessRequest,
	canSeeAccessRequest,
	functionConfig,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { resolveApproval } from './libraryAccess';
import { cleanId, loadActor, requestsCollection, toRows } from './accessRequests';
import { approveRequest, declineRequest, removeAccess } from './accessDecisions';

/** Firestore's `in` takes at most 30 values */
const IN_CHUNK = 30;
const NO_SCHOOL = 'none';

/**
 * The approvers' door — sys-admins and regional coordinators. Admins see and
 * decide every request; a coordinator sees and decides TEACHER requests for
 * the active schools they coordinate (narrowed or not) and nothing else. The
 * applicant's sign-in email is read from usersV2 here, for those rows only.
 */
export const agoraManageAccess = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ManageAccessRequest>): Promise<ManageAccessResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Sign in with a full account');
		}
		const data = request.data ?? ({} as ManageAccessRequest);

		try {
			const { actor, schools } = await loadActor(uid);
			if (!actor.isAdmin && actor.supervisedSchoolIds.size === 0) {
				throw new HttpsError(
					'permission-denied',
					'Only admins and regional coordinators manage access',
				);
			}

			return await dispatch(actor, schools, data);
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.manageAccess',
				userId: uid,
				metadata: { action: data.action },
			});
			throw new HttpsError('internal', 'Failed to manage access');
		}
	},
);

export async function dispatch(
	actor: AgoraAccessActor,
	schools: AgoraSchool[],
	data: ManageAccessRequest,
): Promise<ManageAccessResponse> {
	switch (data.action) {
		case 'list':
			return listRequests(actor, schools, data.status, data.schoolId);
		case 'get':
			return getRequest(actor, data.requestId);
		case 'count':
			return { action: 'count', pending: await countPending(actor) };
		case 'approve':
			return approveRequest(actor, data.requestId, data.schoolId, data.schoolIds);
		case 'decline':
			return declineRequest(actor, data.requestId, data.reason);
		case 'remove':
			return removeAccess(actor, data.uid, data.role, data.schoolId);
		default:
			throw new HttpsError('invalid-argument', 'Unknown action');
	}
}

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));

	return out;
}

/**
 * The queries a caller's view is made of. Equality filters only, so no
 * composite index is needed (Firestore merges single-field indexes); order
 * is applied in memory.
 */
function scopedQueries(
	actor: AgoraAccessActor,
	status: AgoraAccessStatus,
	schoolId?: string,
): Query[] {
	const base = requestsCollection().where('status', '==', status);
	if (actor.isAdmin) {
		return [schoolId && schoolId !== NO_SCHOOL ? base.where('schoolId', '==', schoolId) : base];
	}
	const ids = schoolId ? [schoolId] : [...actor.supervisedSchoolIds];

	return chunks(ids, IN_CHUNK).map((chunk) =>
		base.where('role', '==', 'teacher').where('schoolId', 'in', chunk),
	);
}

async function listRequests(
	actor: AgoraAccessActor,
	schools: AgoraSchool[],
	rawStatus: unknown,
	rawSchoolId: unknown,
): Promise<ManageAccessResponse> {
	const parsed = safeParse(AgoraAccessStatusSchema, rawStatus ?? 'pending');
	if (!parsed.success) throw new HttpsError('invalid-argument', 'Unknown status');
	const status = parsed.output;
	const schoolId =
		rawSchoolId === undefined || rawSchoolId === null
			? undefined
			: cleanId(rawSchoolId, 'schoolId');
	if (schoolId && !actor.isAdmin && !actor.supervisedSchoolIds.has(schoolId)) {
		throw new HttpsError('permission-denied', 'You do not coordinate this school');
	}

	const snaps = await Promise.all(
		scopedQueries(actor, status, schoolId).map((query) =>
			query.limit(AGORA_ACCESS.LIST_LIMIT).get(),
		),
	);
	const found = snaps
		.flatMap((snap) => snap.docs.map((doc) => doc.data() as AgoraAccessRequest))
		.filter((row) => canSeeAccessRequest(actor, row))
		.filter((row) => schoolId !== NO_SCHOOL || row.schoolId === undefined);
	// Waiting requests oldest first (nothing rots at the bottom); decided ones newest first
	found.sort((a, b) =>
		status === 'pending' ? a.createdAt - b.createdAt : (b.decidedAt ?? 0) - (a.decidedAt ?? 0),
	);
	const requests = await toRows(found.slice(0, AGORA_ACCESS.LIST_LIMIT));
	const options: AccessSchoolOption[] = schools.map((school) => ({
		schoolId: school.schoolId,
		name: school.name,
		...(school.city ? { city: school.city } : {}),
	}));

	return { action: 'list', isAdmin: actor.isAdmin, requests, schools: options };
}

async function getRequest(
	actor: AgoraAccessActor,
	rawRequestId: unknown,
): Promise<ManageAccessResponse> {
	const requestId = cleanId(rawRequestId, 'requestId');
	const snap = await requestsCollection().doc(requestId).get();
	const request = snap.data() as AgoraAccessRequest | undefined;
	if (!request || !canSeeAccessRequest(actor, request)) {
		throw new HttpsError('not-found', 'Request not found');
	}
	const [rows, lessons, approval] = await Promise.all([
		toRows([request]),
		db.collection(Collections.agoraSessions).where('teacherId', '==', request.uid).count().get(),
		resolveApproval(request.uid),
	]);

	return {
		action: 'get',
		request: rows[0],
		lessonsRun: lessons.data().count,
		applicantApproved: approval.approved,
		canDecide: canDecideAccessRequest(actor, request),
	};
}

async function countPending(actor: AgoraAccessActor): Promise<number> {
	const counts = await Promise.all(
		scopedQueries(actor, 'pending').map((query) => query.count().get()),
	);

	return counts.reduce((sum, snap) => sum + snap.data().count, 0);
}
