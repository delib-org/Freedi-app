import {
	Collections,
	ORG_INVITE_EXPIRY_MS,
	OrganizationInvitationStatus,
	OrganizationRole,
	Role,
} from '@freedi/shared-types';
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
import { hashToken } from '../orgAuth';
import { fn_acceptOrgInvite } from '../fn_acceptOrgInvite';

const db = fakeDbFrom(dbModule);
const accept = asHandler<{ token: string }, { organizationId: string; role: string }>(
	fn_acceptOrgInvite,
);
const ORG = 'org1';
const TOKEN = 'raw-token';

function seedInvite(overrides: Record<string, unknown> = {}): void {
	const now = Date.now();
	db.seed(Collections.organizationInvitations, 'inv1', {
		invitationId: 'inv1',
		organizationId: ORG,
		organizationName: 'Acme',
		invitedEmail: 'Bob@Example.com',
		invitedBy: 'alice',
		invitedByDisplayName: 'Alice',
		role: OrganizationRole.admin,
		tokenHash: hashToken(TOKEN),
		status: OrganizationInvitationStatus.pending,
		createdAt: now,
		expiresAt: now + ORG_INVITE_EXPIRY_MS,
		acceptedAt: null,
		acceptedByUserId: null,
		...overrides,
	});
	db.seed(Collections.organizations, ORG, {
		organizationId: ORG,
		name: 'Acme',
		memberCount: 1,
		lastUpdate: now,
	});
}

const bobAuth = { uid: 'bob', email: 'bob@example.com', name: 'Bob' };

describe('fn_acceptOrgInvite', () => {
	beforeEach(() => db.reset());

	it('requires auth and a token', async () => {
		await expectHttpsError(accept(makeRequest({ token: TOKEN })), 'unauthenticated');
		await expectHttpsError(accept(makeRequest({ token: '' }, bobAuth)), 'invalid-argument');
	});

	it('rejects unknown tokens', async () => {
		seedInvite();
		await expectHttpsError(accept(makeRequest({ token: 'nope' }, bobAuth)), 'not-found');
	});

	it('rejects revoked invites', async () => {
		seedInvite({ status: OrganizationInvitationStatus.revoked });
		await expectHttpsError(accept(makeRequest({ token: TOKEN }, bobAuth)), 'permission-denied');
	});

	it('rejects already-accepted invites', async () => {
		seedInvite({ status: OrganizationInvitationStatus.accepted });
		await expectHttpsError(accept(makeRequest({ token: TOKEN }, bobAuth)), 'already-exists');
	});

	it('rejects expired invites and marks them expired', async () => {
		seedInvite({ expiresAt: Date.now() - 1 });
		await expectHttpsError(accept(makeRequest({ token: TOKEN }, bobAuth)), 'failed-precondition');
		expect(db.read(Collections.organizationInvitations, 'inv1')?.status).toBe(
			OrganizationInvitationStatus.expired,
		);
	});

	it('rejects an email mismatch', async () => {
		seedInvite();
		await expectHttpsError(
			accept(makeRequest({ token: TOKEN }, { uid: 'eve', email: 'eve@example.com' })),
			'permission-denied',
		);
		expect(db.read(Collections.organizationMembers, `${ORG}--eve`)).toBeUndefined();
	});

	it('accepts (case-insensitively), creates the member, bumps memberCount, materializes admin subs', async () => {
		seedInvite();
		db.seed(Collections.statements, 'q1', {
			statementId: 'q1',
			statement: 'Q1',
			statementType: 'question',
			parentId: 'top',
			topParentId: 'q1',
			creatorId: 'alice',
			organizationId: ORG,
		});

		const result = await accept(makeRequest({ token: TOKEN }, bobAuth));

		expect(result).toEqual({ organizationId: ORG, organizationName: 'Acme', role: 'admin' });
		const member = db.read(Collections.organizationMembers, `${ORG}--bob`);
		expect(member?.role).toBe(OrganizationRole.admin);
		expect(member?.email).toBe('bob@example.com');
		const invite = db.read(Collections.organizationInvitations, 'inv1');
		expect(invite?.status).toBe(OrganizationInvitationStatus.accepted);
		expect(invite?.acceptedByUserId).toBe('bob');
		expect(db.read(Collections.organizations, ORG)?.memberCount).toBe(2);
		expect(db.read(Collections.statementsSubscribe, 'bob--q1')?.role).toBe(Role.admin);
	});
});
