import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { OrganizationActivity, OrganizationRole, functionConfig } from '@freedi/shared-types';
import { commitInChunks, requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';
import { activityRef, demotableSubscribers, unlinkActivityWrites } from './orgActivities';

interface UnlinkOrgStatementRequest {
	organizationId: string;
	statementId: string;
}

/**
 * Removes a linked question from an organization's board and gives back the
 * authority the link granted: org admins drop to `member` on it, except the
 * question's own creator, whose authority never came from the link.
 *
 * The question itself survives untouched — this removes a reference, not a
 * question, which is exactly why it needs no confirmation of destruction.
 */
export const fn_unlinkOrgStatement = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<UnlinkOrgStatementRequest>): Promise<{ removed: boolean }> => {
		const caller = getCallerIdentity(request);
		const { organizationId, statementId } = request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		const ref = activityRef(organizationId, statementId);
		const snap = await ref.get();
		if (!snap.exists) {
			throw new HttpsError('not-found', 'That question is not on this board');
		}
		const activity = snap.data() as OrganizationActivity;
		const demote = await demotableSubscribers(statementId, activity.grantedTo ?? []);

		await commitInChunks(unlinkActivityWrites(organizationId, statementId, demote, Date.now()));

		logger.info('[fn_unlinkOrgStatement] Link removed', {
			organizationId,
			statementId,
			demoted: demote.length,
		});

		return { removed: true };
	},
);
