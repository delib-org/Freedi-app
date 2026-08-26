import { Collections, OrganizationRole, Role } from '@freedi/shared-types';
import { asHandler, expectHttpsError, fakeDbFrom, makeRequest } from './testUtils';

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
import { fn_removeOrgMember } from '../fn_removeOrgMember';

const db = fakeDbFrom(dbModule);
const remove = asHandler<
	{ organizationId: string; userId: string },
	{ removed: true; demoted: number }
>(fn_removeOrgMember);
const ORG = 'org1';

function seedMember(uid: string, role: OrganizationRole): void {
	db.seed(Collections.organizationMembers, `${ORG}--${uid}`, {
		memberId: `${ORG}--${uid}`,
		organizationId: ORG,
		userId: uid,
		email: `${uid}@example.com`,
		displayName: uid,
		role,
		addedAt: 1,
		addedBy: 'alice',
		lastUpdate: 1,
	});
}

describe('fn_removeOrgMember', () => {
	beforeEach(() => {
		db.reset();
		db.seed(Collections.organizations, ORG, { organizationId: ORG, name: 'Acme', memberCount: 2 });
	});

	it('requires an owner caller', async () => {
		seedMember('alice', OrganizationRole.admin);
		seedMember('bob', OrganizationRole.admin);
		await expectHttpsError(
			remove(makeRequest({ organizationId: ORG, userId: 'bob' }, { uid: 'alice' })),
			'permission-denied',
		);
	});

	it('refuses to remove the last owner', async () => {
		seedMember('alice', OrganizationRole.owner);
		seedMember('bob', OrganizationRole.admin);
		await expectHttpsError(
			remove(makeRequest({ organizationId: ORG, userId: 'alice' }, { uid: 'alice' })),
			'failed-precondition',
		);
		expect(db.read(Collections.organizationMembers, `${ORG}--alice`)).toBeDefined();
	});

	it('404s on a missing member', async () => {
		seedMember('alice', OrganizationRole.owner);
		await expectHttpsError(
			remove(makeRequest({ organizationId: ORG, userId: 'ghost' }, { uid: 'alice' })),
			'not-found',
		);
	});

	it('removes a member, decrements memberCount and demotes admin subs', async () => {
		seedMember('alice', OrganizationRole.owner);
		seedMember('bob', OrganizationRole.admin);
		db.seed(Collections.statements, 'q1', {
			statementId: 'q1',
			parentId: 'top',
			creatorId: 'alice',
			organizationId: ORG,
		});
		db.seed(Collections.statementsSubscribe, 'bob--q1', { role: Role.admin, userId: 'bob' });

		const result = await remove(
			makeRequest({ organizationId: ORG, userId: 'bob' }, { uid: 'alice' }),
		);

		expect(result).toEqual({ removed: true, demoted: 1 });
		expect(db.read(Collections.organizationMembers, `${ORG}--bob`)).toBeUndefined();
		expect(db.read(Collections.organizations, ORG)?.memberCount).toBe(1);
		expect(db.read(Collections.statementsSubscribe, 'bob--q1')?.role).toBe(Role.member);
	});

	it('allows removing an owner when another owner remains', async () => {
		seedMember('alice', OrganizationRole.owner);
		seedMember('carol', OrganizationRole.owner);
		const result = await remove(
			makeRequest({ organizationId: ORG, userId: 'carol' }, { uid: 'alice' }),
		);
		expect(result.removed).toBe(true);
		expect(db.read(Collections.organizationMembers, `${ORG}--carol`)).toBeUndefined();
	});
});
