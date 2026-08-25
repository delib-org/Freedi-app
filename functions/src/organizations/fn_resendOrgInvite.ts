import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	OrganizationInvitation,
	OrganizationInvitationStatus,
	OrganizationRole,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../db';
import { requireOrgRole } from './orgAuth';
import { buildInviteLink, getCallerIdentity, mintInviteToken } from './orgInvites';
import { sendOrgInvitationEmail } from './orgEmail';

interface ResendOrgInviteRequest {
	invitationId: string;
}

interface ResendOrgInviteResult {
	invitationId: string;
	inviteLink: string;
	expiresAt: number;
}

/**
 * Owner/admin re-sends an invitation. The token is rotated (new hash, fresh
 * expiry) so an old link stops working; pending and expired invites both
 * return to `pending`.
 */
export const fn_resendOrgInvite = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ResendOrgInviteRequest>): Promise<ResendOrgInviteResult> => {
		const caller = getCallerIdentity(request);
		const { invitationId } = request.data ?? {};
		if (!invitationId || typeof invitationId !== 'string') {
			throw new HttpsError('invalid-argument', 'invitationId is required');
		}

		const inviteRef = db.collection(Collections.organizationInvitations).doc(invitationId);
		const inviteSnap = await inviteRef.get();
		if (!inviteSnap.exists) {
			throw new HttpsError('not-found', 'Invite not found');
		}
		const invitation = inviteSnap.data() as OrganizationInvitation;

		await requireOrgRole(caller.uid, invitation.organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		if (
			invitation.status !== OrganizationInvitationStatus.pending &&
			invitation.status !== OrganizationInvitationStatus.expired
		) {
			throw new HttpsError('failed-precondition', 'Only pending or expired invites can be resent');
		}

		const now = Date.now();
		const { rawToken, tokenHash, expiresAt } = mintInviteToken(now);
		await inviteRef.update({
			tokenHash,
			expiresAt,
			status: OrganizationInvitationStatus.pending,
		});

		const rotated: OrganizationInvitation = {
			...invitation,
			tokenHash,
			expiresAt,
			status: OrganizationInvitationStatus.pending,
		};
		await sendOrgInvitationEmail({ invitation: rotated, rawToken });

		logger.info('[fn_resendOrgInvite] Token rotated and email re-sent', {
			invitationId,
			organizationId: invitation.organizationId,
			resentBy: caller.uid,
		});

		return { invitationId, inviteLink: buildInviteLink(rawToken), expiresAt };
	},
);
