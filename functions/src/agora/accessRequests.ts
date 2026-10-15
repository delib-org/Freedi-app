import type { CollectionReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_ACCESS,
	AccessRequestRow,
	AgoraAccessActor,
	AgoraAccessRequest,
	AgoraAccessRole,
	AgoraAccessSource,
	AgoraSchool,
	Collections,
	getRandomUID,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';
import { supervisedSchools } from './supervisorScope';

/**
 * Reads and writes of `agoraAccessRequests` shared by the two callables and
 * the co-teacher auto-request. Pure decisions (who may decide, who may see)
 * live in shared-types `agoraAccess.ts`.
 */

export function requestsCollection(): CollectionReference {
	return db.collection(Collections.agoraAccessRequests);
}

/** Who the caller is to the approval system: admin flag + the schools they coordinate */
export async function loadActor(
	uid: string,
): Promise<{ actor: AgoraAccessActor; schools: AgoraSchool[] }> {
	const isAdmin = await isSystemAdmin(uid);
	const schools = await supervisedSchools(uid, isAdmin);
	const supervisedSchoolIds = new Set(
		isAdmin
			? []
			: schools.filter((school) => school.supervisorMap?.[uid] === true).map((s) => s.schoolId),
	);

	return { actor: { uid, isAdmin, supervisedSchoolIds }, schools };
}

export interface FileRequestInput {
	uid: string;
	role: AgoraAccessRole;
	fullName: string;
	source: AgoraAccessSource;
	schoolId?: string;
	schoolNameText?: string;
	city?: string;
	note?: string;
	addedBy?: string;
}

export type FileRequestResult =
	| { created: true; request: AgoraAccessRequest }
	| { created: false; request: AgoraAccessRequest };

/** Same person, role and school (or both school-less) */
function sameTarget(
	a: Pick<AgoraAccessRequest, 'role' | 'schoolId'>,
	b: Pick<AgoraAccessRequest, 'role' | 'schoolId'>,
): boolean {
	return a.role === b.role && (a.schoolId ?? '') === (b.schoolId ?? '');
}

/**
 * File a pending request, or return the pending one already filed for the
 * same (person, role, school). Enforces the weekly limit for form/link
 * requests; a co-teacher request (filed on someone else's behalf) does not
 * count against the applicant. One transaction, so two taps file one request.
 */
export async function fileAccessRequest(input: FileRequestInput): Promise<FileRequestResult> {
	const ref = requestsCollection().doc(getRandomUID());

	return db.runTransaction(async (tx) => {
		const own = await tx.get(requestsCollection().where('uid', '==', input.uid));
		const rows = own.docs.map((snap) => snap.data() as AgoraAccessRequest);
		const pending = rows.find((row) => row.status === 'pending' && sameTarget(row, input));
		if (pending) return { created: false, request: pending };

		const now = Date.now();
		if (input.source !== 'coTeacher') {
			const recent = rows.filter(
				(row) => row.source !== 'coTeacher' && now - row.createdAt < AGORA_ACCESS.ROLLING_WEEK_MS,
			);
			if (recent.length >= AGORA_ACCESS.REQUESTS_PER_WEEK) {
				throw new HttpsError('resource-exhausted', 'Too many access requests this week');
			}
		}

		const request: AgoraAccessRequest = {
			requestId: ref.id,
			uid: input.uid,
			role: input.role,
			fullName: input.fullName,
			...(input.schoolId ? { schoolId: input.schoolId } : {}),
			...(input.schoolNameText ? { schoolNameText: input.schoolNameText } : {}),
			...(input.city ? { city: input.city } : {}),
			...(input.note ? { note: input.note } : {}),
			...(input.addedBy ? { addedBy: input.addedBy } : {}),
			source: input.source,
			status: 'pending',
			createdAt: now,
			lastUpdate: now,
		};
		tx.set(ref, request);

		return { created: true, request };
	});
}

interface UserFields {
	email?: unknown;
	displayName?: unknown;
}

/** Sign-in email and display name per uid, read from usersV2 — never stored on a request */
export async function applicantInfo(
	uids: readonly string[],
): Promise<Map<string, { email?: string; displayName?: string }>> {
	const unique = [...new Set(uids)];
	const info = new Map<string, { email?: string; displayName?: string }>();
	if (unique.length === 0) return info;
	const snaps = await db.getAll(...unique.map((uid) => db.collection(Collections.users).doc(uid)));
	snaps.forEach((snap, index) => {
		const data = snap.data() as UserFields | undefined;
		info.set(unique[index], {
			...(typeof data?.email === 'string' ? { email: data.email } : {}),
			...(typeof data?.displayName === 'string' ? { displayName: data.displayName } : {}),
		});
	});

	return info;
}

/** School docs by id (missing ones left out) */
export async function schoolsById(ids: readonly string[]): Promise<Map<string, AgoraSchool>> {
	const unique = [...new Set(ids.filter(Boolean))];
	const schools = new Map<string, AgoraSchool>();
	if (unique.length === 0) return schools;
	const snaps = await db.getAll(
		...unique.map((id) => db.collection(Collections.agoraSchools).doc(id)),
	);
	snaps.forEach((snap) => {
		if (snap.exists) schools.set(snap.id, snap.data() as AgoraSchool);
	});

	return schools;
}

/** Requests as an approver sees them: plus applicant email/name and the school's name */
export async function toRows(requests: AgoraAccessRequest[]): Promise<AccessRequestRow[]> {
	const [people, schools] = await Promise.all([
		applicantInfo(requests.map((request) => request.uid)),
		schoolsById(requests.map((request) => request.schoolId ?? '')),
	]);

	return requests.map((request) => {
		const person = people.get(request.uid);
		const school = request.schoolId ? schools.get(request.schoolId) : undefined;

		return {
			...request,
			...(person?.email ? { applicantEmail: person.email } : {}),
			...(person?.displayName ? { applicantDisplayName: person.displayName } : {}),
			...(school ? { schoolName: school.name } : {}),
		};
	});
}

/**
 * A school was closed: its pending requests are declined with a reason. The
 * applicants are not emailed (the school, not the person, was turned down).
 */
export async function declinePendingForSchool(
	schoolId: string,
	decidedBy: string,
	reason: string,
): Promise<number> {
	const snaps = await requestsCollection()
		.where('schoolId', '==', schoolId)
		.where('status', '==', 'pending')
		.get();
	if (snaps.empty) return 0;
	const now = Date.now();
	const batch = db.batch();
	snaps.docs.forEach((snap) =>
		batch.update(snap.ref, {
			status: 'declined',
			decidedBy,
			decidedVia: 'admin',
			decidedAt: now,
			declineReason: reason,
			lastUpdate: now,
		}),
	);
	await batch.commit();

	return snaps.size;
}

/** Trimmed string within a length, or undefined when empty; throws on a wrong type or overflow */
export function cleanText(value: unknown, max: number, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be text`);
	const trimmed = value.trim();
	if (trimmed.length > max) throw new HttpsError('invalid-argument', `${field} is too long`);

	return trimmed || undefined;
}

/** A Firestore document id coming from a client: non-empty, no path separators */
export function cleanId(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value || value.length > 128 || /[./]/.test(value)) {
		throw new HttpsError('invalid-argument', `${field} is required`);
	}

	return value;
}
