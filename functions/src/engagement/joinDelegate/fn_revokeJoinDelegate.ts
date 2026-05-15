import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	JoinDelegateInvitation,
	JoinDelegateInvitationStatus,
	Role,
	Statement,
	functionConfig,
	getJoinDelegateId,
} from '@freedi/shared-types';
import { db } from '../../db';

type RevokeJoinDelegateRequest = { invitationId: string } | { questionId: string; userId: string };

interface RevokeJoinDelegateResult {
	ok: true;
}

async function authorizeAdminForQuestion(uid: string, questionId: string): Promise<void> {
	const qSnap = await db.collection(Collections.statements).doc(questionId).get();
	if (!qSnap.exists) {
		throw new HttpsError('not-found', 'Question not found');
	}
	const question = qSnap.data() as Statement;
	if (question.creatorId === uid) return;

	const subSnap = await db
		.collection(Collections.statementsSubscribe)
		.doc(`${uid}--${questionId}`)
		.get();
	if (subSnap.exists) {
		const role = subSnap.data()?.role;
		if (role === Role.admin || role === Role.creator) return;
	}

	throw new HttpsError('permission-denied', 'Only question admins can revoke delegates');
}

/**
 * Revoke either a pending invitation (mode 1) or an accepted delegate
 * (mode 2). Mode 1 marks the invitation `revoked` so the admin's list keeps
 * an audit trail; mode 2 deletes the delegate record so the user loses
 * access immediately. Both modes are idempotent.
 */
export const fn_revokeJoinDelegate = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<RevokeJoinDelegateRequest>,
	): Promise<RevokeJoinDelegateResult> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const data = request.data ?? ({} as RevokeJoinDelegateRequest);

		if ('invitationId' in data && data.invitationId) {
			const invitationRef = db
				.collection(Collections.joinDelegateInvitations)
				.doc(data.invitationId);
			const invitationSnap = await invitationRef.get();
			if (!invitationSnap.exists) {
				throw new HttpsError('not-found', 'Invitation not found');
			}
			const invitation = invitationSnap.data() as JoinDelegateInvitation;
			await authorizeAdminForQuestion(uid, invitation.questionId);

			if (invitation.status === JoinDelegateInvitationStatus.pending) {
				await invitationRef.update({ status: JoinDelegateInvitationStatus.revoked });
			}
			// Already-accepted / already-revoked / expired invites silently noop —
			// removing the active delegate is a separate call by design (so the
			// admin can audit + revoke independently).

			logger.info('[fn_revokeJoinDelegate] Revoked invitation', {
				invitationId: invitation.invitationId,
				questionId: invitation.questionId,
			});

			return { ok: true };
		}

		if ('questionId' in data && data.questionId && data.userId) {
			await authorizeAdminForQuestion(uid, data.questionId);
			const delegateId = getJoinDelegateId(data.questionId, data.userId);
			const delegateRef = db.collection(Collections.joinDelegates).doc(delegateId);

			// Idempotent: deleting a missing doc is a noop in admin SDK.
			await delegateRef.delete();

			logger.info('[fn_revokeJoinDelegate] Removed delegate', {
				questionId: data.questionId,
				userId: data.userId,
			});

			return { ok: true };
		}

		throw new HttpsError(
			'invalid-argument',
			'Provide either { invitationId } or { questionId, userId }',
		);
	},
);
