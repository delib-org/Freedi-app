import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { Collections, ScheduledAction, functionConfig } from '@freedi/shared-types';
import { db } from '../../db';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { getCallerIdentity } from '../orgInvites';

export interface ScheduledActionCancelRequest {
	scheduledActionId: string;
}

export interface ScheduledActionCancelResult {
	scheduledActionId: string;
	status: 'cancelled';
}

/** Cancel a pending scheduled action (question admin / org admin). */
export const fn_studioScheduledActionCancel = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ScheduledActionCancelRequest>,
	): Promise<ScheduledActionCancelResult> => {
		const caller = getCallerIdentity(request);
		const { scheduledActionId } = request.data ?? {};
		if (!scheduledActionId || typeof scheduledActionId !== 'string') {
			throw new HttpsError('invalid-argument', 'scheduledActionId is required');
		}
		const ref = db.collection(Collections.scheduledActions).doc(scheduledActionId);
		const snap = await ref.get();
		if (!snap.exists) throw new HttpsError('not-found', 'Scheduled action not found');
		const action = snap.data() as ScheduledAction;
		await assertStatementAdmin(caller.uid, action.statementId, 'studio.scheduledAction.cancel');
		if (action.status !== 'pending') {
			throw new HttpsError('failed-precondition', 'Only pending actions can be cancelled');
		}
		await ref.update({ status: 'cancelled', lastUpdate: Date.now() });

		return { scheduledActionId, status: 'cancelled' };
	},
);
