import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	JoinDelegate,
	JoinDelegateInvitation,
	JoinDelegateInvitationStatus,
	functionConfig,
	getJoinDelegateId,
} from '@freedi/shared-types';
import { db } from '../../db';

interface AcceptJoinDelegateInviteRequest {
	token: string;
}

interface AcceptJoinDelegateInviteResult {
	questionId: string;
	permissions: {
		canManageOrganizerSolutions: boolean;
		canManageParticipantSolutions: boolean;
	};
}

/**
 * The invited user signs in with Google, then calls this function with the
 * token from the URL. We verify the invite is still valid, that the caller's
 * email matches the invited email (case-insensitive), and create both the
 * `joinDelegates/{qid--uid}` record and the `accepted` flag on the invitation
 * inside a single transaction so both writes succeed or fail together.
 */
export const fn_acceptJoinDelegateInvite = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<AcceptJoinDelegateInviteRequest>,
	): Promise<AcceptJoinDelegateInviteResult> => {
		const uid = request.auth?.uid;
		const tokenInfo = request.auth?.token as
			| { email?: string; name?: string; email_verified?: boolean }
			| undefined;
		const callerEmail = tokenInfo?.email?.trim().toLowerCase();

		if (!uid) {
			throw new HttpsError('unauthenticated', 'You must be signed in to accept an invite');
		}
		if (!callerEmail) {
			throw new HttpsError(
				'failed-precondition',
				'Sign in with a Google account that has an email address',
			);
		}

		const { token } = request.data ?? {};
		if (!token || typeof token !== 'string') {
			throw new HttpsError('invalid-argument', 'Missing invite token');
		}

		// Look up the invitation by token (token is unique).
		const invitesSnap = await db
			.collection(Collections.joinDelegateInvitations)
			.where('token', '==', token)
			.limit(1)
			.get();

		if (invitesSnap.empty) {
			throw new HttpsError('not-found', 'Invite not found');
		}

		const inviteDoc = invitesSnap.docs[0];
		const invitation = inviteDoc.data() as JoinDelegateInvitation;

		// Status checks. Map each non-pending case to a distinct error code so
		// the client can render the right state without parsing message text.
		if (invitation.status === JoinDelegateInvitationStatus.accepted) {
			throw new HttpsError('already-exists', 'This invite has already been accepted');
		}
		if (invitation.status === JoinDelegateInvitationStatus.revoked) {
			throw new HttpsError('permission-denied', 'This invite has been cancelled');
		}

		const now = Date.now();
		if (invitation.expiresAt < now) {
			// Auto-flip stale invites so the admin's list stays accurate.
			if (invitation.status !== JoinDelegateInvitationStatus.expired) {
				await inviteDoc.ref.update({ status: JoinDelegateInvitationStatus.expired });
			}
			throw new HttpsError('failed-precondition', 'This invite has expired');
		}
		if (invitation.status !== JoinDelegateInvitationStatus.pending) {
			throw new HttpsError('failed-precondition', 'This invite is no longer pending');
		}

		if (invitation.invitedEmail.trim().toLowerCase() !== callerEmail) {
			throw new HttpsError(
				'permission-denied',
				'This invite was sent to a different email address',
			);
		}

		// Transactional accept: write the delegate record and flip the invite.
		const delegateId = getJoinDelegateId(invitation.questionId, uid);
		const delegateRef = db.collection(Collections.joinDelegates).doc(delegateId);
		const displayName = tokenInfo?.name?.trim() || callerEmail;

		await db.runTransaction(async (tx) => {
			const existingDelegate = await tx.get(delegateRef);
			const baseAddedAt = existingDelegate.exists
				? ((existingDelegate.data() as JoinDelegate).addedAt ?? now)
				: now;

			const delegate: JoinDelegate = {
				delegateId,
				questionId: invitation.questionId,
				userId: uid,
				email: callerEmail,
				displayName,
				permissions: invitation.permissions,
				addedAt: baseAddedAt,
				addedBy: invitation.invitedBy,
				lastUpdate: now,
			};
			tx.set(delegateRef, delegate);

			tx.update(inviteDoc.ref, {
				status: JoinDelegateInvitationStatus.accepted,
				acceptedAt: now,
				acceptedByUserId: uid,
			});
		});

		logger.info('[fn_acceptJoinDelegateInvite] Accepted', {
			invitationId: invitation.invitationId,
			questionId: invitation.questionId,
			uid,
		});

		return {
			questionId: invitation.questionId,
			permissions: invitation.permissions,
		};
	},
);
