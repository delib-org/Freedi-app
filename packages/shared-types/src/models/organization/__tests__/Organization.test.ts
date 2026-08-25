// setupTests.ts mocks valibot package-wide (every parse succeeds). These
// tests are about the real schemas rejecting bad data, so opt back in.
jest.unmock('valibot');

import { parse, safeParse } from 'valibot';
import {
	ORG_ADMIN_ROLES,
	ORG_INVITE_EXPIRY_MS,
	OrganizationInvitationSchema,
	OrganizationInvitationStatus,
	OrganizationMemberSchema,
	OrganizationRole,
	OrganizationSchema,
	OrganizationStatus,
	getOrganizationMemberId,
} from '../Organization';
import { Access } from '../../TypeEnums';

describe('Organization schemas', () => {
	const now = 1_700_000_000_000;

	it('parses a minimal organization', () => {
		const org = parse(OrganizationSchema, {
			organizationId: 'org-1',
			name: 'Acme Consulting',
			status: OrganizationStatus.active,
			createdBy: 'sysadmin-1',
			createdAt: now,
			lastUpdate: now,
		});
		expect(org.organizationId).toBe('org-1');
		expect(org.slug).toBeUndefined();
	});

	it('accepts the optional fields', () => {
		const result = safeParse(OrganizationSchema, {
			organizationId: 'org-1',
			name: 'Acme',
			slug: 'acme',
			status: OrganizationStatus.suspended,
			createdBy: 'u',
			createdAt: now,
			lastUpdate: now,
			memberCount: 2,
			questionCount: 5,
			defaultAccess: Access.openToAll,
			logoURL: null,
			defaultLanguage: 'he',
		});
		expect(result.success).toBe(true);
	});

	it('rejects an unknown status', () => {
		const result = safeParse(OrganizationSchema, {
			organizationId: 'org-1',
			name: 'Acme',
			status: 'deleted',
			createdBy: 'u',
			createdAt: now,
			lastUpdate: now,
		});
		expect(result.success).toBe(false);
	});

	it('parses a member and rejects an unknown role', () => {
		const member = parse(OrganizationMemberSchema, {
			memberId: getOrganizationMemberId('org-1', 'u-1'),
			organizationId: 'org-1',
			userId: 'u-1',
			email: 'a@b.c',
			displayName: 'A',
			role: OrganizationRole.admin,
			addedAt: now,
			addedBy: 'u-0',
			lastUpdate: now,
		});
		expect(member.memberId).toBe('org-1--u-1');

		expect(
			safeParse(OrganizationMemberSchema, { ...member, role: 'superuser' }).success,
		).toBe(false);
	});

	it('parses an invitation with a token hash only', () => {
		const invitation = parse(OrganizationInvitationSchema, {
			invitationId: 'inv-1',
			organizationId: 'org-1',
			organizationName: 'Acme',
			invitedEmail: 'a@b.c',
			invitedBy: 'u-0',
			invitedByDisplayName: 'Owner',
			role: OrganizationRole.admin,
			tokenHash: 'sha256hex',
			status: OrganizationInvitationStatus.pending,
			createdAt: now,
			expiresAt: now + ORG_INVITE_EXPIRY_MS,
			acceptedAt: null,
			acceptedByUserId: null,
		});
		expect(invitation.expiresAt - invitation.createdAt).toBe(7 * 24 * 60 * 60 * 1000);
	});

	it('exposes the admin roles without viewer', () => {
		expect(ORG_ADMIN_ROLES).toEqual([OrganizationRole.owner, OrganizationRole.admin]);
		expect(ORG_ADMIN_ROLES).not.toContain(OrganizationRole.viewer);
	});
});
