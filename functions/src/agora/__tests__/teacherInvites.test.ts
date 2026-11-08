import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Teacher email invites end to end over the in-memory Firestore:
 * agoraAdminManageSchool's assign / resend / cancel / remove, and the claim
 * that agoraRequestAccess {status} runs on every Agora sign-in.
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
jest.mock('../teacherInviteEmail', () => ({
	sendTeacherInviteEmail: jest.fn(async () => true),
}));

import type {
	ManageSchoolRequest,
	ManageSchoolResponse,
	RequestAccessRequest,
	RequestAccessResponse,
} from '@freedi/shared-types';
import { store } from './helpers/fakeFirestore';
import {
	ADMIN,
	SCHOOL_A,
	TEACHER_A,
	codeOf,
	school,
	seedWorld,
	user,
} from './helpers/accessHarness';
import { agoraAdminManageSchool } from '../fn_agoraAdminManageSchool';
import { agoraRequestAccess } from '../fn_agoraRequestAccess';
import { sendTeacherInviteEmail } from '../teacherInviteEmail';
import { claimTeacherInvites, claimableEmail, inviteRefFor } from '../teacherInvites';

interface Token {
	email?: string;
	email_verified?: boolean;
	firebase: { sign_in_provider: string };
}

type Handler<Req, Res> = (request: {
	auth?: { uid: string; token: Token };
	data: Req;
}) => Promise<Res>;

const manageSchool = agoraAdminManageSchool as unknown as Handler<
	ManageSchoolRequest,
	ManageSchoolResponse
>;
const requestAccess = agoraRequestAccess as unknown as Handler<
	RequestAccessRequest,
	RequestAccessResponse
>;

const NEW_EMAIL = 'new.teacher@school.org';
const NEW_UID = 'new-teacher';

function google(email?: string, verified = true): Token {
	return { email, email_verified: verified, firebase: { sign_in_provider: 'google.com' } };
}

function asAdmin(data: ManageSchoolRequest, uid = ADMIN): Promise<ManageSchoolResponse> {
	return manageSchool({ auth: { uid, token: google(`${uid}@school.org`) }, data });
}

function inviteDoc(schoolId = SCHOOL_A, email = NEW_EMAIL): Record<string, unknown> | undefined {
	return store.get(`agoraTeacherInvites/${inviteRefFor(schoolId, email).id}`);
}

function schoolDoc(schoolId = SCHOOL_A): Record<string, unknown> {
	return store.get(`agoraSchools/${schoolId}`) ?? {};
}

async function signInStatus(uid: string, token: Token): Promise<RequestAccessResponse> {
	return requestAccess({ auth: { uid, token }, data: { action: 'status' } });
}

beforeEach(() => {
	jest.clearAllMocks();
	seedWorld();
});

describe('assignTeacher by email', () => {
	it('files a pending invite (normalized email) and emails it when no account has the address', async () => {
		const res = await asAdmin({
			action: 'assignTeacher',
			schoolId: SCHOOL_A,
			teacherEmail: '  New.Teacher@School.org ',
		});
		expect(res).toMatchObject({ schoolId: SCHOOL_A, invited: true, emailSent: true });
		expect(inviteDoc()).toMatchObject({
			schoolId: SCHOOL_A,
			email: NEW_EMAIL,
			status: 'pending',
			invitedBy: ADMIN,
			sendCount: 1,
		});
		expect(sendTeacherInviteEmail).toHaveBeenCalledWith(
			{ kind: 'invite', schoolName: `School ${SCHOOL_A}`, email: NEW_EMAIL },
			expect.any(Object),
		);
	});

	it('inviting the same address twice keeps one invite and re-sends', async () => {
		await asAdmin({ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL });
		await asAdmin({ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL });
		const invites = [...store.keys()].filter((key) => key.startsWith('agoraTeacherInvites/'));
		expect(invites).toHaveLength(1);
		expect(inviteDoc()?.sendCount).toBe(2);
		expect(sendTeacherInviteEmail).toHaveBeenCalledTimes(2);
	});

	it('attaches an existing account at once, writes the grant and sends "you were added"', async () => {
		user('known');
		const res = await asAdmin({
			action: 'assignTeacher',
			schoolId: SCHOOL_A,
			teacherEmail: 'known@school.org',
		});
		expect(res).toMatchObject({ teacherUid: 'known', invited: false, emailSent: true });
		expect(schoolDoc()).toMatchObject({ teacherMap: { known: true } });
		expect(schoolDoc().teacherIds).toContain('known');
		expect(store.get('agoraApprovedTeachers/known')).toMatchObject({
			grant: { source: 'assigned', grantedBy: ADMIN },
		});
		expect(sendTeacherInviteEmail).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'added', email: 'known@school.org' }),
			expect.any(Object),
		);
		expect(inviteDoc(SCHOOL_A, 'known@school.org')).toBeUndefined();
	});

	it('still succeeds when the email could not be sent, and says so', async () => {
		jest.mocked(sendTeacherInviteEmail).mockResolvedValueOnce(false);
		const res = await asAdmin({
			action: 'assignTeacher',
			schoolId: SCHOOL_A,
			teacherEmail: NEW_EMAIL,
		});
		expect(res).toMatchObject({ invited: true, emailSent: false });
		expect(inviteDoc()?.status).toBe('pending');
	});

	it('refuses a malformed email and an archived school', async () => {
		expect(
			await codeOf(asAdmin({ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: 'nope' })),
		).toBe('invalid-argument');
		school('closed', { status: 'archived' });
		expect(
			await codeOf(
				asAdmin({ action: 'assignTeacher', schoolId: 'closed', teacherEmail: NEW_EMAIL }),
			),
		).toBe('failed-precondition');
	});

	it('refuses a non-admin: no invite, no email', async () => {
		expect(
			await codeOf(
				asAdmin(
					{ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL },
					TEACHER_A,
				),
			),
		).toBe('permission-denied');
		expect(inviteDoc()).toBeUndefined();
		expect(sendTeacherInviteEmail).not.toHaveBeenCalled();
	});
});

describe('resend and cancel', () => {
	beforeEach(async () => {
		await asAdmin({ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL });
		jest.clearAllMocks();
	});

	it('resends a pending invite', async () => {
		const res = await asAdmin({
			action: 'resendTeacherInvite',
			schoolId: SCHOOL_A,
			teacherEmail: NEW_EMAIL,
		});
		expect(res.emailSent).toBe(true);
		expect(inviteDoc()?.sendCount).toBe(2);
		expect(sendTeacherInviteEmail).toHaveBeenCalledTimes(1);
	});

	it('cannot resend or cancel what is not a pending invite', async () => {
		expect(
			await codeOf(
				asAdmin({ action: 'resendTeacherInvite', schoolId: SCHOOL_A, teacherEmail: 'x@y.org' }),
			),
		).toBe('not-found');
		expect(
			await codeOf(
				asAdmin({ action: 'cancelTeacherInvite', schoolId: SCHOOL_A, teacherEmail: 'x@y.org' }),
			),
		).toBe('not-found');
	});

	it('cancel deletes the invite', async () => {
		const res = await asAdmin({
			action: 'cancelTeacherInvite',
			schoolId: SCHOOL_A,
			teacherEmail: NEW_EMAIL,
		});
		expect(res.inviteCancelled).toBe(true);
		expect(inviteDoc()).toBeUndefined();
	});

	it('remove-by-email cancels a pending invite for someone with no account', async () => {
		const res = await asAdmin({
			action: 'removeTeacher',
			schoolId: SCHOOL_A,
			teacherEmail: NEW_EMAIL,
		});
		expect(res).toMatchObject({ inviteCancelled: true });
		expect(res.teacherUid).toBeUndefined();
		expect(inviteDoc()).toBeUndefined();
		expect(
			await codeOf(
				asAdmin({ action: 'removeTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL }),
			),
		).toBe('not-found');
	});

	it('a non-admin can neither resend nor cancel', async () => {
		for (const action of ['resendTeacherInvite', 'cancelTeacherInvite'] as const) {
			expect(
				await codeOf(asAdmin({ action, schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL }, TEACHER_A)),
			).toBe('permission-denied');
		}
		expect(inviteDoc()?.status).toBe('pending');
	});
});

describe('claim on sign-in', () => {
	beforeEach(async () => {
		await asAdmin({ action: 'assignTeacher', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL });
	});

	it('a verified Google sign-in with the invited email joins the school and is approved', async () => {
		user(NEW_UID, { email: NEW_EMAIL });
		const res = await signInStatus(NEW_UID, google('New.Teacher@school.org'));
		expect(res).toMatchObject({ action: 'status', approved: true });
		expect(schoolDoc()).toMatchObject({ teacherMap: { [NEW_UID]: true } });
		expect(inviteDoc()).toMatchObject({ status: 'accepted', acceptedBy: NEW_UID });
		expect(store.get(`agoraApprovedTeachers/${NEW_UID}`)).toMatchObject({
			grant: { source: 'assigned', grantedBy: ADMIN },
		});
	});

	it('an UNVERIFIED email claims nothing', async () => {
		const res = await signInStatus(NEW_UID, google(NEW_EMAIL, false));
		expect(res).toMatchObject({ approved: false });
		expect(schoolDoc().teacherMap).not.toHaveProperty(NEW_UID);
		expect(inviteDoc()?.status).toBe('pending');
	});

	it('a non-Google sign-in claims nothing, even when verified', async () => {
		expect(
			await claimTeacherInvites(NEW_UID, {
				email: NEW_EMAIL,
				email_verified: true,
				firebase: { sign_in_provider: 'password' },
			}),
		).toEqual([]);
		expect(inviteDoc()?.status).toBe('pending');
	});

	it('someone else signing in claims nothing', async () => {
		expect(await claimTeacherInvites('stranger', google('stranger@school.org'))).toEqual([]);
		expect(inviteDoc()?.status).toBe('pending');
	});

	it('is idempotent: a second sign-in changes nothing', async () => {
		expect(await claimTeacherInvites(NEW_UID, google(NEW_EMAIL))).toEqual([SCHOOL_A]);
		const afterFirst = JSON.stringify([schoolDoc(), inviteDoc()]);
		expect(await claimTeacherInvites(NEW_UID, google(NEW_EMAIL))).toEqual([]);
		expect(JSON.stringify([schoolDoc(), inviteDoc()])).toBe(afterFirst);
		expect((schoolDoc().teacherIds as string[]).filter((id) => id === NEW_UID)).toHaveLength(1);
	});

	it('claims every school that invited the address, and leaves a closed school pending', async () => {
		school('school-c');
		school('school-d');
		await asAdmin({ action: 'assignTeacher', schoolId: 'school-c', teacherEmail: NEW_EMAIL });
		await asAdmin({ action: 'assignTeacher', schoolId: 'school-d', teacherEmail: NEW_EMAIL });
		school('school-d', { status: 'archived' });
		const joined = await claimTeacherInvites(NEW_UID, google(NEW_EMAIL));
		expect(joined.sort()).toEqual([SCHOOL_A, 'school-c'].sort());
		expect(inviteDoc('school-d')?.status).toBe('pending');
	});

	it('a cancelled invite can no longer be claimed', async () => {
		await asAdmin({ action: 'cancelTeacherInvite', schoolId: SCHOOL_A, teacherEmail: NEW_EMAIL });
		expect(await claimTeacherInvites(NEW_UID, google(NEW_EMAIL))).toEqual([]);
		expect(schoolDoc().teacherMap).not.toHaveProperty(NEW_UID);
	});
});

describe('claimableEmail', () => {
	it('needs google.com, email_verified === true and an email', () => {
		expect(claimableEmail(google(' A@B.org '))).toBe('a@b.org');
		expect(claimableEmail(google('a@b.org', false))).toBeNull();
		expect(claimableEmail(google(undefined))).toBeNull();
		expect(claimableEmail(undefined)).toBeNull();
		expect(
			claimableEmail({
				email: 'a@b.org',
				email_verified: 'true',
				firebase: { sign_in_provider: 'google.com' },
			}),
		).toBeNull();
	});
});
