import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * agoraRequestAccess + agoraManageAccess end to end over an in-memory
 * Firestore: the permission matrix of IA spec §9, the writes an approval
 * makes (school attachment, grant, coordinator scope) and the privacy rule
 * that the applicant's email is joined in for approvers only.
 */

jest.mock('../../db', () => ({
	db: jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore')
		.fakeDb,
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue:
		jest.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore')
			.fakeFieldValue,
}));
jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_options: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		details: unknown;
		constructor(code: string, message: string, details?: unknown) {
			super(message);
			this.code = code;
			this.details = details;
		}
	},
}));
jest.mock('../../utils/httpAuth', () => ({
	isSystemAdmin: async (uid: string) =>
		jest
			.requireActual<typeof import('./helpers/fakeFirestore')>('./helpers/fakeFirestore')
			.store.get(`usersV2/${uid}`)?.systemAdmin === true,
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../accessEmail', () => ({
	sendDecisionEmail: jest.fn(async () => true),
	sendNewRequestEmails: jest.fn(async () => 1),
}));

import { store } from './helpers/fakeFirestore';
import { sendDecisionEmail, sendNewRequestEmails } from '../accessEmail';
import {
	ADMIN,
	APPLICANT,
	COORD_A,
	COORD_NARROW,
	OTHER_APPLICANT,
	SCHOOL_A,
	SCHOOL_B,
	TEACHER_A,
	as,
	codeOf,
	manageAccess,
	requestAccess,
	requestDoc,
	school,
	seedWorld,
	submitTeacher,
} from './helpers/accessHarness';

beforeEach(() => {
	jest.clearAllMocks();
	seedWorld();
});

describe('agoraRequestAccess', () => {
	it('refuses anonymous and signed-out callers', async () => {
		expect(await codeOf(as(requestAccess, APPLICANT, { action: 'status' }, 'anonymous'))).toBe(
			'permission-denied',
		);
		expect(
			await codeOf(
				requestAccess({ data: { action: 'status' } } as Parameters<typeof requestAccess>[0]),
			),
		).toBe('unauthenticated');
	});

	it('files a link request at the school, never storing the email, and tells its coordinators', async () => {
		const requestId = await submitTeacher(APPLICANT, SCHOOL_A);
		const doc = requestDoc(requestId);
		expect(doc).toMatchObject({
			uid: APPLICANT,
			role: 'teacher',
			schoolId: SCHOOL_A,
			source: 'link',
			status: 'pending',
		});
		expect(JSON.stringify(doc)).not.toContain('@');
		expect(sendNewRequestEmails).toHaveBeenCalledWith(
			expect.objectContaining({ requestId }),
			`School ${SCHOOL_A}`,
			[COORD_A, COORD_NARROW],
		);
	});

	it('returns the same pending request on a second tap (one per person, role and school)', async () => {
		const first = await submitTeacher(APPLICANT, SCHOOL_A);
		const second = await submitTeacher(APPLICANT, SCHOOL_A);
		expect(second).toBe(first);
		expect(sendNewRequestEmails).toHaveBeenCalledTimes(1);
	});

	it('caps requests at five a week', async () => {
		for (let i = 0; i < 5; i++) {
			const id = await submitTeacher(APPLICANT, SCHOOL_A);
			await as(requestAccess, APPLICANT, { action: 'withdraw', requestId: id });
		}
		expect(await codeOf(submitTeacher(APPLICANT, SCHOOL_A))).toBe('resource-exhausted');
	});

	it('needs a typed school and city without a link, and refuses an unknown or closed school', async () => {
		expect(
			await codeOf(
				as(requestAccess, APPLICANT, { action: 'submit', role: 'teacher', fullName: 'Dana Levi' }),
			),
		).toBe('invalid-argument');
		expect(await codeOf(submitTeacher(APPLICANT, 'nope'))).toBe('not-found');
		school('closed', { status: 'archived' });
		expect(await codeOf(submitTeacher(APPLICANT, 'closed'))).toBe('not-found');
	});

	it('refuses asking for access one already holds', async () => {
		expect(await codeOf(submitTeacher(TEACHER_A, SCHOOL_A))).toBe('already-exists');
		expect(await codeOf(submitTeacher(TEACHER_A))).toBe('failed-precondition');
	});

	it("withdraws one's own pending request, and treats someone else's as missing", async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		expect(
			await codeOf(as(requestAccess, OTHER_APPLICANT, { action: 'withdraw', requestId: id })),
		).toBe('not-found');
		await as(requestAccess, APPLICANT, { action: 'withdraw', requestId: id });
		expect(requestDoc(id).status).toBe('withdrawn');
		expect(await codeOf(as(requestAccess, APPLICANT, { action: 'withdraw', requestId: id }))).toBe(
			'failed-precondition',
		);
	});

	it('reports status: own requests with school names, and the approval', async () => {
		await submitTeacher(APPLICANT, SCHOOL_A);
		const res = await as(requestAccess, APPLICANT, { action: 'status' });
		expect(res).toMatchObject({ action: 'status', approved: false, isAdmin: false });
		if (res.action !== 'status') throw new Error('unexpected');
		expect(res.requests).toHaveLength(1);
		expect(res.requests[0]).toMatchObject({ status: 'pending', schoolName: `School ${SCHOOL_A}` });
	});
});

describe('agoraManageAccess — who may act', () => {
	it('refuses a caller who is neither admin nor coordinator', async () => {
		expect(await codeOf(as(manageAccess, TEACHER_A, { action: 'list' }))).toBe('permission-denied');
		expect(await codeOf(as(manageAccess, APPLICANT, { action: 'count' }))).toBe(
			'permission-denied',
		);
	});

	it("lists a coordinator's school teacher requests only, with the applicant email joined in", async () => {
		const mine = await submitTeacher(APPLICANT, SCHOOL_A);
		await submitTeacher(OTHER_APPLICANT, SCHOOL_B);
		await submitTeacher(OTHER_APPLICANT);
		await as(requestAccess, OTHER_APPLICANT, {
			action: 'submit',
			role: 'supervisor',
			fullName: 'Wants to coordinate',
			schoolId: SCHOOL_A,
		});
		const res = await as(manageAccess, COORD_A, { action: 'list' });
		if (res.action !== 'list') throw new Error('unexpected');
		expect(res.requests.map((row) => row.requestId)).toEqual([mine]);
		expect(res.requests[0].applicantEmail).toBe(`${APPLICANT}@school.org`);
		expect(res.schools.map((s) => s.schoolId)).toEqual([SCHOOL_A]);
		expect(await codeOf(as(manageAccess, COORD_A, { action: 'list', schoolId: SCHOOL_B }))).toBe(
			'permission-denied',
		);
		const count = await as(manageAccess, COORD_A, { action: 'count' });
		expect(count).toEqual({ action: 'count', pending: 1 });
	});

	it('lists everything for an admin, and the no-school filter', async () => {
		await submitTeacher(APPLICANT, SCHOOL_A);
		const loose = await submitTeacher(OTHER_APPLICANT);
		const all = await as(manageAccess, ADMIN, { action: 'list' });
		if (all.action !== 'list') throw new Error('unexpected');
		expect(all.requests).toHaveLength(2);
		const none = await as(manageAccess, ADMIN, { action: 'list', schoolId: 'none' });
		if (none.action !== 'list') throw new Error('unexpected');
		expect(none.requests.map((row) => row.requestId)).toEqual([loose]);
	});

	it("hides another school's request from a coordinator as not-found", async () => {
		const elsewhere = await submitTeacher(APPLICANT, SCHOOL_B);
		expect(await codeOf(as(manageAccess, COORD_A, { action: 'get', requestId: elsewhere }))).toBe(
			'not-found',
		);
		expect(
			await codeOf(as(manageAccess, COORD_A, { action: 'approve', requestId: elsewhere })),
		).toBe('not-found');
	});

	it('gets one request with lessons already run and whether the coordinator may decide', async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		store.set('agoraSessions/s1', { sessionId: 's1', teacherId: APPLICANT });
		const res = await as(manageAccess, COORD_A, { action: 'get', requestId: id });
		expect(res).toMatchObject({
			action: 'get',
			lessonsRun: 1,
			applicantApproved: false,
			canDecide: true,
		});
	});
});

describe('agoraManageAccess — approve', () => {
	it('coordinator approval attaches the teacher, writes the grant and closes the request', async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		const res = await as(manageAccess, COORD_A, { action: 'approve', requestId: id });
		expect(res).toEqual({
			action: 'approve',
			requestId: id,
			status: 'approved',
			grantedSchoolIds: [SCHOOL_A],
		});
		const schoolDoc = store.get(`agoraSchools/${SCHOOL_A}`) ?? {};
		expect((schoolDoc.teacherMap as Record<string, boolean>)[APPLICANT]).toBe(true);
		expect(schoolDoc.teacherIds).toContain(APPLICANT);
		expect(store.get(`agoraApprovedTeachers/${APPLICANT}`)).toMatchObject({
			via: 'school',
			grant: { source: 'request', grantedBy: COORD_A, requestId: id },
		});
		expect(requestDoc(id)).toMatchObject({
			status: 'approved',
			decidedBy: COORD_A,
			decidedVia: 'supervisor',
		});
		expect(sendDecisionEmail).toHaveBeenCalledWith(
			expect.objectContaining({ requestId: id }),
			'approved',
		);
		expect(await codeOf(as(manageAccess, COORD_A, { action: 'approve', requestId: id }))).toBe(
			'failed-precondition',
		);
	});

	it("a narrowed coordinator's approval joins their scope", async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		await as(manageAccess, COORD_NARROW, { action: 'approve', requestId: id });
		const scopes = (store.get(`agoraSchools/${SCHOOL_A}`) ?? {}).supervisorScopes as Record<
			string,
			{ teacherIds: string[] }
		>;
		expect(scopes[COORD_NARROW].teacherIds).toEqual([APPLICANT]);
	});

	it('a coordinator may not re-home a request, decide a coordinator request, or decide their own', async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		expect(
			await codeOf(
				as(manageAccess, COORD_A, { action: 'approve', requestId: id, schoolId: SCHOOL_B }),
			),
		).toBe('permission-denied');
		const sup = await as(requestAccess, OTHER_APPLICANT, {
			action: 'submit',
			role: 'supervisor',
			fullName: 'Wants to coordinate',
			schoolId: SCHOOL_A,
		});
		if (sup.action !== 'submit') throw new Error('unexpected');
		expect(
			await codeOf(as(manageAccess, COORD_A, { action: 'approve', requestId: sup.requestId })),
		).toBe('not-found');
		school(SCHOOL_B, { supervisorIds: [COORD_A], supervisorMap: { [COORD_A]: true } });
		const own = await submitTeacher(COORD_A, SCHOOL_B);
		expect(await codeOf(as(manageAccess, COORD_A, { action: 'approve', requestId: own }))).toBe(
			'permission-denied',
		);
	});

	it('an admin approves a coordinator request onto the schools they pick', async () => {
		const sup = await as(requestAccess, APPLICANT, {
			action: 'submit',
			role: 'supervisor',
			fullName: 'Regional person',
		});
		if (sup.action !== 'submit') throw new Error('unexpected');
		expect(
			await codeOf(as(manageAccess, ADMIN, { action: 'approve', requestId: sup.requestId })),
		).toBe('invalid-argument');
		const res = await as(manageAccess, ADMIN, {
			action: 'approve',
			requestId: sup.requestId,
			schoolIds: [SCHOOL_A, SCHOOL_B],
		});
		expect(res).toMatchObject({ grantedSchoolIds: [SCHOOL_A, SCHOOL_B] });
		expect(
			(store.get(`agoraSchools/${SCHOOL_B}`)?.supervisorMap as Record<string, boolean>)[APPLICANT],
		).toBe(true);
		expect(store.get(`agoraApprovedTeachers/${APPLICANT}`)).toMatchObject({ via: 'supervisor' });
	});

	it('an admin picks the school for a school-less request, or approves with no school (grant only)', async () => {
		const picked = await submitTeacher(APPLICANT);
		await as(manageAccess, ADMIN, { action: 'approve', requestId: picked, schoolId: SCHOOL_B });
		expect(
			(store.get(`agoraSchools/${SCHOOL_B}`)?.teacherMap as Record<string, boolean>)[APPLICANT],
		).toBe(true);
		const loose = await submitTeacher(OTHER_APPLICANT);
		await as(manageAccess, ADMIN, { action: 'approve', requestId: loose });
		expect(store.get(`agoraApprovedTeachers/${OTHER_APPLICANT}`)).toMatchObject({ via: 'granted' });
		expect(requestDoc(loose)).toMatchObject({ grantedSchoolIds: [], decidedVia: 'admin' });
	});

	it('refuses approving onto a closed school', async () => {
		const id = await submitTeacher(APPLICANT);
		school('closed', { status: 'archived' });
		expect(
			await codeOf(
				as(manageAccess, ADMIN, { action: 'approve', requestId: id, schoolId: 'closed' }),
			),
		).toBe('not-found');
		expect(requestDoc(id).status).toBe('pending');
	});
});
