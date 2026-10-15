import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	AGORA_ACCESS,
	AccessStatusRow,
	AgoraAccessRequest,
	AgoraAccessRole,
	AgoraSchool,
	functionConfig,
	RequestAccessRequest,
	RequestAccessResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { resolveApproval } from './libraryAccess';
import {
	cleanId,
	cleanText,
	fileAccessRequest,
	requestsCollection,
	schoolsById,
} from './accessRequests';
import { sendNewRequestEmails } from './accessEmail';

/** Own requests the status view returns */
const STATUS_ROWS = 10;
const MIN_NAME_LENGTH = 2;

/**
 * The applicant's door: submit a request, withdraw it, read where it stands.
 * Clients cannot write `agoraAccessRequests` (rules); this is the only writer
 * besides the approvers' `agoraManageAccess` and the co-teacher auto-request.
 */
export const agoraRequestAccess = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RequestAccessRequest>): Promise<RequestAccessResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Sign in with a full account to request access');
		}
		const data = request.data ?? ({} as RequestAccessRequest);

		try {
			if (data.action === 'submit') return await submit(uid, data);
			if (data.action === 'withdraw') return await withdraw(uid, data.requestId);
			if (data.action === 'status') return await status(uid);
			throw new HttpsError('invalid-argument', 'Unknown action');
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.requestAccess',
				userId: uid,
				metadata: { action: data.action },
			});
			throw new HttpsError('internal', 'Failed to handle the access request');
		}
	},
);

type SubmitInput = Extract<RequestAccessRequest, { action: 'submit' }>;

function cleanRole(value: unknown): AgoraAccessRole {
	if (value !== 'teacher' && value !== 'supervisor') {
		throw new HttpsError('invalid-argument', 'role must be teacher or supervisor');
	}

	return value;
}

async function submit(uid: string, data: SubmitInput): Promise<RequestAccessResponse> {
	const role = cleanRole(data.role);
	const fullName = cleanText(data.fullName, AGORA_ACCESS.MAX_NAME_LENGTH, 'fullName');
	if (!fullName || fullName.length < MIN_NAME_LENGTH) {
		throw new HttpsError('invalid-argument', 'fullName is required');
	}
	const note = cleanText(data.note, AGORA_ACCESS.MAX_NOTE_LENGTH, 'note');
	const schoolId = data.schoolId === undefined ? undefined : cleanId(data.schoolId, 'schoolId');
	const schoolNameText = schoolId
		? undefined
		: cleanText(data.schoolNameText, AGORA_ACCESS.MAX_SCHOOL_TEXT_LENGTH, 'schoolNameText');
	const city = schoolId ? undefined : cleanText(data.city, AGORA_ACCESS.MAX_CITY_LENGTH, 'city');

	let school: AgoraSchool | undefined;
	if (schoolId) {
		school = (await schoolsById([schoolId])).get(schoolId);
		if (!school || school.status !== 'active') {
			throw new HttpsError('not-found', 'School not found');
		}
		const attached =
			role === 'teacher' ? school.teacherMap?.[uid] === true : school.supervisorMap?.[uid] === true;
		if (attached) {
			throw new HttpsError('already-exists', 'You already have this access at this school');
		}
	} else if (role === 'teacher') {
		if (!schoolNameText || !city) {
			throw new HttpsError('invalid-argument', 'Name your school and its city');
		}
		if ((await resolveApproval(uid)).approved) {
			throw new HttpsError('failed-precondition', 'You are already an approved teacher');
		}
	}

	const filed = await fileAccessRequest({
		uid,
		role,
		fullName,
		source: schoolId ? 'link' : 'form',
		...(schoolId ? { schoolId } : {}),
		...(schoolNameText ? { schoolNameText } : {}),
		...(city ? { city } : {}),
		...(note ? { note } : {}),
	});

	if (filed.created && school && role === 'teacher') {
		await sendNewRequestEmails(filed.request, school.name, Object.keys(school.supervisorMap ?? {}));
	}

	return { action: 'submit', requestId: filed.request.requestId, status: 'pending' };
}

async function withdraw(uid: string, rawRequestId: unknown): Promise<RequestAccessResponse> {
	const requestId = cleanId(rawRequestId, 'requestId');
	const ref = requestsCollection().doc(requestId);
	await db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const current = snap.data() as AgoraAccessRequest | undefined;
		// Someone else's request answers exactly like a missing one
		if (!current || current.uid !== uid) {
			throw new HttpsError('not-found', 'Request not found');
		}
		if (current.status !== 'pending') {
			throw new HttpsError('failed-precondition', 'Only a pending request can be withdrawn');
		}
		const now = Date.now();
		tx.update(ref, { status: 'withdrawn', decidedAt: now, lastUpdate: now });
	});

	return { action: 'withdraw', requestId, status: 'withdrawn' };
}

async function status(uid: string): Promise<RequestAccessResponse> {
	const [approval, snaps] = await Promise.all([
		resolveApproval(uid),
		requestsCollection().where('uid', '==', uid).get(),
	]);
	const own = snaps.docs
		.map((snap) => snap.data() as AgoraAccessRequest)
		.sort((a, b) => b.createdAt - a.createdAt)
		.slice(0, STATUS_ROWS);
	const schools = await schoolsById(own.map((row) => row.schoolId ?? ''));
	const requests: AccessStatusRow[] = own.map((row) => {
		const schoolName = row.schoolId ? schools.get(row.schoolId)?.name : row.schoolNameText;

		return {
			requestId: row.requestId,
			role: row.role,
			status: row.status,
			...(row.schoolId ? { schoolId: row.schoolId } : {}),
			...(schoolName ? { schoolName } : {}),
			...(row.declineReason ? { declineReason: row.declineReason } : {}),
			createdAt: row.createdAt,
			...(row.decidedAt !== undefined ? { decidedAt: row.decidedAt } : {}),
		};
	});

	return { action: 'status', approved: approval.approved, isAdmin: approval.isAdmin, requests };
}
