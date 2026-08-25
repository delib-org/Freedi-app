import { Collections, OrganizationMember, OrganizationRole, Role } from '@freedi/shared-types';
import { fakeDbFrom, expectHttpsError } from './testUtils';

jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));
jest.mock('../../db', () => {
	const { createFakeDb } = jest.requireActual('./fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../../utils/httpAuth', () => ({ isSystemAdmin: jest.fn(async () => false) }));

import * as dbModule from '../../db';
import { isSystemAdmin } from '../../utils/httpAuth';
import {
	demoteOrgMemberOnTopQuestions,
	hashToken,
	materializeOrgAdminOnTopQuestions,
	requireOrgRole,
	getStudioBaseUrl,
} from '../orgAuth';

const db = fakeDbFrom(dbModule);
const ORG = 'org1';

const bob: OrganizationMember = {
	memberId: `${ORG}--bob`,
	organizationId: ORG,
	userId: 'bob',
	email: 'bob@example.com',
	displayName: 'Bob',
	role: OrganizationRole.admin,
	addedAt: 1,
	addedBy: 'alice',
	lastUpdate: 1,
};

function seedQuestion(id: string, creatorId: string): void {
	db.seed(Collections.statements, id, {
		statementId: id,
		statement: `Q ${id}`,
		statementType: 'question',
		parentId: 'top',
		topParentId: id,
		creatorId,
		creator: { uid: creatorId, displayName: creatorId },
		organizationId: ORG,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
	});
}

function seedSub(uid: string, statementId: string, role: Role): void {
	db.seed(Collections.statementsSubscribe, `${uid}--${statementId}`, {
		role,
		userId: uid,
		statementId,
		statementsSubscribeId: `${uid}--${statementId}`,
		lastUpdate: 1,
	});
}

describe('orgAuth', () => {
	beforeEach(() => {
		db.reset();
		(isSystemAdmin as jest.Mock).mockResolvedValue(false);
	});

	describe('materializeOrgAdminOnTopQuestions', () => {
		it('never downgrades creator/admin subs and grants admin elsewhere', async () => {
			seedQuestion('q1', 'bob');
			seedQuestion('q2', 'alice');
			seedQuestion('q3', 'alice');
			seedQuestion('q4', 'alice');
			seedSub('bob', 'q1', Role.creator);
			seedSub('bob', 'q2', Role.admin);
			seedSub('bob', 'q3', Role.member);

			const written = await materializeOrgAdminOnTopQuestions(ORG, bob);

			expect(written).toBe(2);
			expect(db.read(Collections.statementsSubscribe, 'bob--q1')?.role).toBe(Role.creator);
			expect(db.read(Collections.statementsSubscribe, 'bob--q2')?.role).toBe(Role.admin);
			const q3 = db.read(Collections.statementsSubscribe, 'bob--q3');
			expect(q3?.role).toBe(Role.admin);
			expect(q3?.organizationId).toBe(ORG);
			const q4 = db.read(Collections.statementsSubscribe, 'bob--q4');
			expect(q4?.role).toBe(Role.admin);
			expect(q4?.topParentId).toBe('q4');
			expect((q4?.user as { uid: string }).uid).toBe('bob');
		});

		it('ignores statements of other organizations', async () => {
			db.seed(Collections.statements, 'other', {
				statementId: 'other',
				parentId: 'top',
				organizationId: 'org2',
				creatorId: 'x',
			});
			expect(await materializeOrgAdminOnTopQuestions(ORG, bob)).toBe(0);
			expect(db.read(Collections.statementsSubscribe, 'bob--other')).toBeUndefined();
		});
	});

	describe('demoteOrgMemberOnTopQuestions', () => {
		it('demotes admin subs but skips own questions and non-admin subs', async () => {
			seedQuestion('q1', 'bob');
			seedQuestion('q2', 'alice');
			seedQuestion('q3', 'alice');
			seedSub('bob', 'q1', Role.admin);
			seedSub('bob', 'q2', Role.admin);
			seedSub('bob', 'q3', Role.member);

			const demoted = await demoteOrgMemberOnTopQuestions(ORG, 'bob');

			expect(demoted).toBe(1);
			expect(db.read(Collections.statementsSubscribe, 'bob--q1')?.role).toBe(Role.admin);
			expect(db.read(Collections.statementsSubscribe, 'bob--q2')?.role).toBe(Role.member);
			expect(db.read(Collections.statementsSubscribe, 'bob--q3')?.role).toBe(Role.member);
		});
	});

	describe('requireOrgRole', () => {
		it('rejects non-members and wrong roles, accepts matching roles', async () => {
			await expectHttpsError(
				requireOrgRole('bob', ORG, [OrganizationRole.owner]),
				'permission-denied',
			);
			db.seed(Collections.organizationMembers, bob.memberId, bob);
			await expectHttpsError(
				requireOrgRole('bob', ORG, [OrganizationRole.owner]),
				'permission-denied',
			);
			const member = await requireOrgRole('bob', ORG, [OrganizationRole.admin]);
			expect(member.userId).toBe('bob');
		});

		it('lets a system admin through with a synthetic owner record', async () => {
			(isSystemAdmin as jest.Mock).mockResolvedValue(true);
			const member = await requireOrgRole('root', ORG, [OrganizationRole.owner]);
			expect(member.role).toBe(OrganizationRole.owner);
			expect(member.userId).toBe('root');
		});
	});

	it('hashToken is a stable sha256 hex digest', () => {
		expect(hashToken('abc')).toHaveLength(64);
		expect(hashToken('abc')).toBe(hashToken('abc'));
		expect(hashToken('abc')).not.toBe(hashToken('abd'));
	});

	it('getStudioBaseUrl honours STUDIO_APP_BASE_URL', () => {
		const prev = process.env.STUDIO_APP_BASE_URL;
		process.env.STUDIO_APP_BASE_URL = 'https://studio.example.com/';
		expect(getStudioBaseUrl()).toBe('https://studio.example.com');
		if (prev === undefined) delete process.env.STUDIO_APP_BASE_URL;
		else process.env.STUDIO_APP_BASE_URL = prev;
	});
});
