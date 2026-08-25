import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Organization,
	OrganizationInvitation,
	OrganizationInvitationStatus,
	OrganizationRole,
	OrganizationStatus,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../db';
import { requireOrgRole } from './orgAuth';
import {
	INVITABLE_ROLES,
	buildInvitation,
	getCallerIdentity,
	normalizeEmailOrThrow,
} from './orgInvites';
import { sendOrgInvitationEmail } from './orgEmail';

interface InviteOrgMemberRequest {
	organizationId: string;
	email: string;
	role: OrganizationRole;
}

interface InviteOrgMemberResult {
	invitationId: string;
	inviteLink: string;
}

/**
 * Org owner/admin invites an email address. Owner-role invites require an
 * owner (system admins pass as synthetic owners). Rejects addresses that are
 * already members or already hold a live pending invite.
 */
export const fn_inviteOrgMember = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<InviteOrgMemberRequest>): Promise<InviteOrgMemberResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, email, role } = request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (!INVITABLE_ROLES.includes(role)) {
			throw new HttpsError('invalid-argument', 'role must be admin or owner');
		}
		const normalizedEmail = normalizeEmailOrThrow(email);

		const member = await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);
		if (role === OrganizationRole.owner && member.role !== OrganizationRole.owner) {
			throw new HttpsError('permission-denied', 'Only an owner can invite another owner');
		}

		const orgSnap = await db.collection(Collections.organizations).doc(organizationId).get();
		if (!orgSnap.exists) {
			throw new HttpsError('not-found', 'Organization not found');
		}
		const organization = orgSnap.data() as Organization;
		if (organization.status !== OrganizationStatus.active) {
			throw new HttpsError('failed-precondition', 'Organization is not active');
		}

		const existingMembers = await db
			.collection(Collections.organizationMembers)
			.where('organizationId', '==', organizationId)
			.where('email', '==', normalizedEmail)
			.limit(1)
			.get();
		if (!existingMembers.empty) {
			throw new HttpsError('already-exists', 'This email is already a member');
		}

		const now = Date.now();
		const pendingInvites = await db
			.collection(Collections.organizationInvitations)
			.where('organizationId', '==', organizationId)
			.where('invitedEmail', '==', normalizedEmail)
			.where('status', '==', OrganizationInvitationStatus.pending)
			.get();
		const hasLiveInvite = pendingInvites.docs.some(
			(doc) => (doc.data() as OrganizationInvitation).expiresAt > now,
		);
		if (hasLiveInvite) {
			throw new HttpsError('already-exists', 'This email already has a pending invite');
		}

		const built = buildInvitation({
			organizationId,
			organizationName: organization.name,
			invitedEmail: normalizedEmail,
			role,
			inviter: caller,
			now,
		});
		await db
			.collection(Collections.organizationInvitations)
			.doc(built.invitation.invitationId)
			.set(built.invitation);

		await sendOrgInvitationEmail({
			invitation: built.invitation,
			rawToken: built.rawToken,
			language: organization.defaultLanguage?.toLowerCase().startsWith('he') ? 'he' : 'en',
		});

		logger.info('[fn_inviteOrgMember] Invitation created', {
			organizationId,
			invitationId: built.invitation.invitationId,
			invitedEmail: normalizedEmail,
			role,
		});

		return { invitationId: built.invitation.invitationId, inviteLink: built.inviteLink };
	},
);
