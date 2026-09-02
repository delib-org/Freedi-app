import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { syncSurveyStatus } from './surveyWriter';

/**
 * A Studio-made Crowd survey is gated by the MC survey's `status`, while the
 * facilitator flips `statementSettings.questionStatus` (Studio, Join, the
 * scheduler). Keep the two in step so Open/Freeze/Close on the dashboard
 * really opens/closes the survey for participants.
 */
export const mirrorQuestionStatusToSurvey = onDocumentUpdated(
	{ document: `${Collections.statements}/{statementId}`, region: functionConfig.region },
	async (event) => {
		const before = event.data?.before.data() as Partial<Statement> | undefined;
		const after = event.data?.after.data() as Partial<Statement> | undefined;
		const surveyId = after?.questionSettings?.massConsensusSurveyId;
		if (!after || !surveyId) return;
		const prevStatus = before?.statementSettings?.questionStatus;
		const nextStatus = after.statementSettings?.questionStatus;
		if (prevStatus === nextStatus) return;
		try {
			await syncSurveyStatus(surveyId, nextStatus, Date.now());
		} catch (error) {
			logError(error, {
				operation: 'studio.mirrorQuestionStatusToSurvey',
				statementId: after.statementId,
				metadata: { surveyId, nextStatus },
			});
		}
	},
);
