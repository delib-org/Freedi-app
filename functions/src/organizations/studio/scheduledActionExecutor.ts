import {
	Collections,
	QuestionStatus,
	ScheduledAction,
	Statement,
	StudioScheduledActionKind,
} from '@freedi/shared-types';
import { db } from '../../db';
import { sendQuestionNudge } from '../../fn_nudgeQuestionSubscribers';
import { syncSurveyStatus } from './surveyWriter';

const QUESTION_STATUS_BY_ACTION: Record<
	Exclude<StudioScheduledActionKind, 'nudge'>,
	QuestionStatus
> = { open: 'live', freeze: 'frozen', close: 'closed' };

/**
 * Runs one scheduled action. Status actions write the same shape Studio's
 * manual `setQuestionStatus` writes and keep the MC survey (if any) in step;
 * reminder actions reuse the facilitator nudge with the cooldown bypassed.
 */
export async function executeScheduledAction(action: ScheduledAction, now: number): Promise<void> {
	const ref = db.collection(Collections.statements).doc(action.statementId);
	const snap = await ref.get();
	if (!snap.exists) {
		throw new Error(`Target question ${action.statementId} no longer exists`);
	}
	const statement = snap.data() as Statement;

	if (action.action === 'nudge') {
		if (!action.nudge?.message) {
			throw new Error('Scheduled reminder has no message');
		}
		await sendQuestionNudge({
			statement,
			message: action.nudge.message,
			audience: action.nudge.audience,
			channels: action.nudge.channels,
			callerUid: action.createdBy,
			callerName: 'Facilitator',
			now,
			enforceCooldown: false,
		});

		return;
	}

	const questionStatus = QUESTION_STATUS_BY_ACTION[action.action];
	await ref.set({ statementSettings: { questionStatus }, lastUpdate: now }, { merge: true });
	const surveyId = statement.questionSettings?.massConsensusSurveyId;
	if (surveyId) {
		await syncSurveyStatus(surveyId, questionStatus, now);
	}
}
