import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	OrganizationInvitation,
	OrganizationInvitationStatus,
	OrganizationMember,
	OrganizationRole,
	functionConfig,
	getOrganizationMemberId,
} from '@freedi/shared-types';
import { db } from '../db';
import { hashToken, materializeOrgAdminOnTopQuestions } from './orgAuth';
import { getCallerIdentity } from './orgInvites';

interface AcceptOrgInviteRequest {
	token: string;
}

interface AcceptOrgInviteResult {
	organizationId: string;
	organizationName: string;
	role: OrganizationRole;
}

/**
 * Invited user signs in and redeems the raw token from the link. We look the
 * invite up by token hash, verify status/expiry/email, then in one
 * transaction create the member record, flip the invite to accepted and bump
 * the org's memberCount. Admin subscriptions on the org's existing top
 * questions are materialized afterwards.
 */
export const fn_acceptOrgInvite = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<AcceptOrgInviteRequest>): Promise<AcceptOrgInviteResult> => {
		const caller = getCallerIdentity(request);
		if (!caller.email) {
			throw new HttpsError(
				'failed-precondition',
				'Sign in with a Google account that has an email address',
			);
		}

		const { token } = request.data ?? {};
		if (!token || typeof token !== 'string') {
			throw new HttpsError('invalid-argument', 'Missing invite token');
		}

		const invitesSnap = await db
			.collection(Collections.organizationInvitations)
			.where('tokenHash', '==', hashToken(token))
			.limit(1)
			.get();
		if (invitesSnap.empty) {
			throw new HttpsError('not-found', 'Invite not found');
		}

		const inviteDoc = invitesSnap.docs[0];
		const invitation = inviteDoc.data() as OrganizationInvitation;

		if (invitation.status === OrganizationInvitationStatus.accepted) {
			throw new HttpsError('already-exists', 'This invite has already been accepted');
		}
		if (invitation.status === OrganizationInvitationStatus.revoked) {
			throw new HttpsError('permission-denied', 'This invite has been cancelled');
		}

		const now = Date.now();
		if (invitation.expiresAt < now) {
			if (invitation.status !== OrganizationInvitationStatus.expired) {
				await inviteDoc.ref.update({ status: OrganizationInvitationStatus.expired });
			}
			throw new HttpsError('failed-precondition', 'This invite has expired');
		}
		if (invitation.status !== OrganizationInvitationStatus.pending) {
			throw new HttpsError('failed-precondition', 'This invite is no longer pending');
		}
		if (invitation.invitedEmail.trim().toLowerCase() !== caller.email) {
			throw new HttpsError(
				'permission-denied',
				'This invite was sent to a different email address',
			);
		}

		const memberId = getOrganizationMemberId(invitation.organizationId, caller.uid);
		const memberRef = db.collection(Collections.organizationMembers).doc(memberId);
		const orgRef = db.collection(Collections.organizations).doc(invitation.organizationId);

		const member: OrganizationMember = {
			memberId,
			organizationId: invitation.organizationId,
			userId: caller.uid,
			email: caller.email,
			displayName: caller.displayName,
			role: invitation.role,
			addedAt: now,
			addedBy: invitation.invitedBy,
			lastUpdate: now,
		};

		await db.runTransaction(async (tx) => {
			const existingMember = await tx.get(memberRef);
			if (existingMember.exists) {
				// Re-accepting (e.g. upgraded role): keep the original addedAt.
				const prior = existingMember.data() as OrganizationMember;
				tx.set(memberRef, { ...member, addedAt: prior.addedAt ?? now });
			} else {
				tx.set(memberRef, member);
				tx.update(orgRef, { memberCount: FieldValue.increment(1), lastUpdate: now });
			}
			tx.update(inviteDoc.ref, {
				status: OrganizationInvitationStatus.accepted,
				acceptedAt: now,
				acceptedByUserId: caller.uid,
			});
		});

		const materialized = await materializeOrgAdminOnTopQuestions(invitation.organizationId, member);

		logger.info('[fn_acceptOrgInvite] Accepted', {
			invitationId: invitation.invitationId,
			organizationId: invitation.organizationId,
			uid: caller.uid,
			role: invitation.role,
			materialized,
		});

		return {
			organizationId: invitation.organizationId,
			organizationName: invitation.organizationName,
			role: invitation.role,
		};
	},
);
