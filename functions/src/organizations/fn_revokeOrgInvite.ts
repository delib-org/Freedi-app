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
import { getCallerIdentity } from './orgInvites';

interface RevokeOrgInviteRequest {
	invitationId: string;
}

interface RevokeOrgInviteResult {
	invitationId: string;
	status: OrganizationInvitationStatus;
}

/** Owner/admin cancels a pending invitation. */
export const fn_revokeOrgInvite = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RevokeOrgInviteRequest>): Promise<RevokeOrgInviteResult> => {
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

		if (invitation.status !== OrganizationInvitationStatus.pending) {
			throw new HttpsError('failed-precondition', 'Only pending invites can be revoked');
		}

		await inviteRef.update({ status: OrganizationInvitationStatus.revoked });

		logger.info('[fn_revokeOrgInvite] Revoked', {
			invitationId,
			organizationId: invitation.organizationId,
			revokedBy: caller.uid,
		});

		return { invitationId, status: OrganizationInvitationStatus.revoked };
	},
);
