import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * agoraManageAccess decline and remove, over the in-memory Firestore: who may
 * remove whom, and that removing someone's last school revokes their grant.
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
import { sendDecisionEmail } from '../accessEmail';
import {
	ADMIN,
	APPLICANT,
	COORD_A,
	COORD_NARROW,
	SCHOOL_A,
	SCHOOL_B,
	TEACHER_A,
	as,
	codeOf,
	manageAccess,
	requestDoc,
	school,
	seedWorld,
	submitTeacher,
} from './helpers/accessHarness';

beforeEach(() => {
	jest.clearAllMocks();
	seedWorld();
});

describe('agoraManageAccess — decline', () => {
	it('declines with a reason and emails it; a decided request cannot be declined again', async () => {
		const id = await submitTeacher(APPLICANT, SCHOOL_A);
		await as(manageAccess, COORD_A, {
			action: 'decline',
			requestId: id,
			reason: 'Not a teacher here',
		});
		expect(requestDoc(id)).toMatchObject({
			status: 'declined',
			declineReason: 'Not a teacher here',
		});
		expect(sendDecisionEmail).toHaveBeenCalledWith(
			expect.objectContaining({ requestId: id }),
			'declined',
			'Not a teacher here',
		);
		expect(await codeOf(as(manageAccess, ADMIN, { action: 'decline', requestId: id }))).toBe(
			'failed-precondition',
		);
	});
});

describe('agoraManageAccess — remove', () => {
	beforeEach(() => {
		store.set(`agoraApprovedTeachers/${TEACHER_A}`, {
			teacherId: TEACHER_A,
			via: 'granted',
			checkedAt: 1,
			grant: { source: 'grandfathered', grantedAt: 1, grantedBy: 'backfill' },
		});
	});

	it('a coordinator removes a teacher of their school; with no school left the grant goes too', async () => {
		const res = await as(manageAccess, COORD_A, {
			action: 'remove',
			uid: TEACHER_A,
			role: 'teacher',
			schoolId: SCHOOL_A,
		});
		expect(res).toEqual({
			action: 'remove',
			uid: TEACHER_A,
			removedFromSchoolIds: [SCHOOL_A],
			stillApproved: false,
		});
		expect(
			(store.get(`agoraSchools/${SCHOOL_A}`)?.teacherMap as Record<string, boolean>)[TEACHER_A],
		).toBeUndefined();
		expect(store.has(`agoraApprovedTeachers/${TEACHER_A}`)).toBe(false);
	});

	it('keeps the approval when the teacher still holds another school', async () => {
		school(SCHOOL_B, { teacherIds: [TEACHER_A], teacherMap: { [TEACHER_A]: true } });
		const res = await as(manageAccess, COORD_A, {
			action: 'remove',
			uid: TEACHER_A,
			role: 'teacher',
			schoolId: SCHOOL_A,
		});
		expect(res).toMatchObject({ stillApproved: true });
		expect(store.has(`agoraApprovedTeachers/${TEACHER_A}`)).toBe(true);
	});

	it('refuses a narrowed coordinator out of scope, a coordinator removing a coordinator, or no school', async () => {
		const base = { action: 'remove' as const, uid: TEACHER_A, schoolId: SCHOOL_A };
		expect(await codeOf(as(manageAccess, COORD_NARROW, { ...base, role: 'teacher' }))).toBe(
			'permission-denied',
		);
		expect(
			await codeOf(as(manageAccess, COORD_A, { ...base, uid: COORD_NARROW, role: 'supervisor' })),
		).toBe('permission-denied');
		expect(
			await codeOf(
				as(manageAccess, COORD_A, { action: 'remove', uid: TEACHER_A, role: 'teacher' }),
			),
		).toBe('permission-denied');
	});

	it('refuses removing someone who holds no access there (no grant revoked by guessing a uid)', async () => {
		store.set(`agoraApprovedTeachers/${APPLICANT}`, {
			teacherId: APPLICANT,
			via: 'granted',
			checkedAt: 1,
			grant: { source: 'grandfathered', grantedAt: 1, grantedBy: 'backfill' },
		});
		expect(
			await codeOf(
				as(manageAccess, COORD_A, {
					action: 'remove',
					uid: APPLICANT,
					role: 'teacher',
					schoolId: SCHOOL_A,
				}),
			),
		).toBe('not-found');
		expect(store.has(`agoraApprovedTeachers/${APPLICANT}`)).toBe(true);
	});

	it('an admin removes someone everywhere, both roles, and revokes the grant', async () => {
		school(SCHOOL_B, { supervisorIds: [TEACHER_A], supervisorMap: { [TEACHER_A]: true } });
		const res = await as(manageAccess, ADMIN, {
			action: 'remove',
			uid: TEACHER_A,
			role: 'teacher',
		});
		expect(res).toMatchObject({ stillApproved: false });
		if (res.action !== 'remove') throw new Error('unexpected');
		expect(res.removedFromSchoolIds.sort()).toEqual([SCHOOL_A, SCHOOL_B]);
		expect(store.has(`agoraApprovedTeachers/${TEACHER_A}`)).toBe(false);
	});
});
