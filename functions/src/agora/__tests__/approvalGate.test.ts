import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * The hard gate (Tal, 2026-10-15): a pending teacher gets NOTHING until
 * approved — no lesson, no class, no roster, no scenario. Grandfathered and
 * attached teachers pass. Also: admin attach writes the grant, archive
 * declines a school's waiting requests, and a co-teacher add files a request.
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
jest.mock('../../config/openai-chat', () => ({
	callLLM: jest.fn(),
	extractJson: jest.fn(),
	TAXONOMY_MODEL: 'x',
	WORKER_MODEL: 'x',
}));
jest.mock('../accessEmail', () => ({
	sendDecisionEmail: jest.fn(async () => true),
	sendNewRequestEmails: jest.fn(async () => 1),
}));

import { store } from './helpers/fakeFirestore';
import { NOT_APPROVED_REASON, requireApprovedTeacher, resolveApproval } from '../libraryAccess';
import { agoraCreateSession } from '../fn_agoraCreateSession';
import { agoraTeacherClass } from '../fn_agoraTeacherClass';
import { agoraTeacherRoster } from '../fn_agoraTeacherRoster';
import { agoraGenerateTopicPackage } from '../fn_agoraGenerateTopicPackage';
import { agoraAdminManageSchool } from '../fn_agoraAdminManageSchool';

type AnyHandler = (request: {
	auth?: { uid: string; token: { firebase: { sign_in_provider: string } } };
	data: unknown;
}) => Promise<unknown>;

function call(handler: unknown, uid: string, data: unknown): Promise<unknown> {
	return (handler as AnyHandler)({
		auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } },
		data,
	});
}

async function failure(promise: Promise<unknown>): Promise<{ code: string; details?: unknown }> {
	try {
		await promise;

		return { code: 'ok' };
	} catch (error) {
		const e = error as { code?: string; details?: unknown };

		return { code: e.code ?? 'unknown', details: e.details };
	}
}

const ADMIN = 'admin';
const PENDING = 'pending-teacher';
const GRANTED = 'grandfathered';
const ATTACHED = 'attached-teacher';
const COORD = 'coordinator';

function marker(uid: string, withGrant: boolean): void {
	store.set(`agoraApprovedTeachers/${uid}`, {
		teacherId: uid,
		via: withGrant ? 'granted' : 'school',
		checkedAt: 1,
		...(withGrant
			? { grant: { source: 'grandfathered', grantedAt: 1, grantedBy: 'backfill' } }
			: {}),
	});
}

beforeEach(() => {
	store.clear();
	store.set(`usersV2/${ADMIN}`, { systemAdmin: true });
	[PENDING, GRANTED, ATTACHED, COORD].forEach((uid) =>
		store.set(`usersV2/${uid}`, { email: `${uid}@x.org`, displayName: uid }),
	);
	marker(GRANTED, true);
	store.set('agoraSchools/s1', {
		schoolId: 's1',
		name: 'S1',
		status: 'active',
		createdBy: ADMIN,
		classCount: 1,
		teacherIds: [ATTACHED],
		teacherMap: { [ATTACHED]: true },
		supervisorIds: [COORD],
		supervisorMap: { [COORD]: true },
		createdAt: 1,
		lastUpdate: 1,
	});
	store.set('agoraSchools/old', {
		schoolId: 'old',
		name: 'Old',
		status: 'archived',
		createdBy: ADMIN,
		classCount: 0,
		teacherIds: [PENDING],
		teacherMap: { [PENDING]: true },
		createdAt: 1,
		lastUpdate: 1,
	});
	store.set('agoraClasses/c1', {
		classId: 'c1',
		schoolId: 's1',
		name: 'C1',
		teacherIds: [ATTACHED, PENDING],
		teacherMap: { [ATTACHED]: true, [PENDING]: true },
	});
	store.set('agoraClassAggregates/c1', { classId: 'c1' });
});

describe('resolveApproval — the single seam', () => {
	it('approves admins, grants, and active attachments; nothing else', async () => {
		expect(await resolveApproval(ADMIN)).toMatchObject({ approved: true, via: 'admin' });
		expect(await resolveApproval(GRANTED)).toMatchObject({ approved: true, via: 'granted' });
		expect(await resolveApproval(ATTACHED)).toMatchObject({ approved: true, via: 'school' });
		expect(await resolveApproval(COORD)).toMatchObject({ approved: true, via: 'supervisor' });
		// Attached only to an archived school, and a co-teacher on a class: still pending
		expect(await resolveApproval(PENDING)).toMatchObject({ approved: false });
	});

	it('does not count a marker without a grant as approval (derived markers are a cache)', async () => {
		marker(PENDING, false);
		expect(await resolveApproval(PENDING)).toMatchObject({ approved: false });
	});
});

describe('requireApprovedTeacher', () => {
	const req = (uid: string) =>
		({ auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } }, data: {} }) as never;

	it('refuses a pending teacher with a machine-readable reason', async () => {
		const result = await failure(requireApprovedTeacher(req(PENDING)));
		expect(result).toEqual({ code: 'permission-denied', details: { reason: NOT_APPROVED_REASON } });
	});

	it('heals the rules-visible marker for an attached teacher who has none', async () => {
		expect(store.has(`agoraApprovedTeachers/${ATTACHED}`)).toBe(false);
		await requireApprovedTeacher(req(ATTACHED));
		expect(store.get(`agoraApprovedTeachers/${ATTACHED}`)).toMatchObject({ via: 'school' });
	});
});

describe('server gates on lessons, classes, rosters and scenarios', () => {
	const gated: Array<[string, unknown, unknown]> = [
		[
			'agoraCreateSession',
			agoraCreateSession,
			{ quick: { mainQuestion: 'Q?' }, deviceMode: 'individual' },
		],
		['agoraTeacherClass create', agoraTeacherClass, { action: 'create', name: 'New class' }],
		['agoraTeacherClass rename', agoraTeacherClass, { action: 'rename', classId: 'c1', name: 'X' }],
		[
			'agoraTeacherRoster',
			agoraTeacherRoster,
			{ classId: 'c1', action: 'resetPin', memberId: 'm1' },
		],
		['agoraGenerateTopicPackage', agoraGenerateTopicPackage, { topic: 'Should we?' }],
	];

	it.each(gated)('%s refuses a pending teacher', async (_name, handler, data) => {
		expect((await failure(call(handler, PENDING, data))).code).toBe('permission-denied');
	});

	it.each(gated)('%s lets a grandfathered teacher past the gate', async (_name, handler, data) => {
		const { details } = await failure(call(handler, GRANTED, data));
		expect(details).not.toEqual({ reason: NOT_APPROVED_REASON });
	});
});

describe('co-teacher added by email', () => {
	it('files a pending coTeacher request at the class school when the co-teacher is not approved', async () => {
		store.set('usersV2/newbie', { email: 'newbie@x.org', displayName: 'New Bie' });
		await call(agoraTeacherClass, ATTACHED, {
			action: 'addTeacher',
			classId: 'c1',
			teacherEmail: 'newbie@x.org',
		});
		const requests = [...store.entries()].filter(([path]) =>
			path.startsWith('agoraAccessRequests/'),
		);
		expect(requests).toHaveLength(1);
		expect(requests[0][1]).toMatchObject({
			uid: 'newbie',
			role: 'teacher',
			source: 'coTeacher',
			schoolId: 's1',
			addedBy: ATTACHED,
			status: 'pending',
		});
	});

	it('files nothing for an already approved co-teacher', async () => {
		await call(agoraTeacherClass, ATTACHED, {
			action: 'addTeacher',
			classId: 'c1',
			teacherEmail: `${GRANTED}@x.org`,
		});
		expect([...store.keys()].some((path) => path.startsWith('agoraAccessRequests/'))).toBe(false);
	});
});

describe('agoraAdminManageSchool and approval', () => {
	it('assignTeacher writes an explicit grant; removeTeacher from the last school revokes it', async () => {
		await call(agoraAdminManageSchool, ADMIN, {
			action: 'assignTeacher',
			schoolId: 's1',
			teacherEmail: `${PENDING}@x.org`,
		});
		expect(store.get(`agoraApprovedTeachers/${PENDING}`)).toMatchObject({
			grant: { source: 'assigned', grantedBy: ADMIN },
		});
		await call(agoraAdminManageSchool, ADMIN, {
			action: 'removeTeacher',
			schoolId: 's1',
			teacherEmail: `${PENDING}@x.org`,
		});
		expect(store.has(`agoraApprovedTeachers/${PENDING}`)).toBe(false);
	});

	it('archiving a school declines its waiting requests', async () => {
		store.set('agoraAccessRequests/r1', {
			requestId: 'r1',
			uid: PENDING,
			role: 'teacher',
			fullName: 'P',
			schoolId: 's1',
			source: 'link',
			status: 'pending',
			createdAt: 1,
			lastUpdate: 1,
		});
		await call(agoraAdminManageSchool, ADMIN, { action: 'archive', schoolId: 's1' });
		expect(store.get('agoraAccessRequests/r1')).toMatchObject({
			status: 'declined',
			declineReason: 'The school was closed',
		});
	});
});
