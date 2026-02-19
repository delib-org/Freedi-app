/**
 * Firestore onDelete trigger handler for evaluations.
 *
 * Processes evaluation deletions by reversing their contribution
 * to the target statement's evaluation metrics and refreshing
 * parent chosen options.
 */

import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import type { Evaluation } from '@freedi/shared-types';
import { ActionTypes, isEventAlreadyProcessed, markEventAsProcessed } from './evaluationTypes';
import { updateStatementEvaluation } from './statementEvaluationUpdater';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';

export async function deleteEvaluation(event: FirestoreEvent<DocumentSnapshot>): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate delete event ${eventId}`);

			return;
		}
		markEventAsProcessed(eventId);

		const evaluation = event.data.data() as Evaluation & { source?: string };
		const { statementId, evaluation: evaluationValue } = evaluation;
		const userId = evaluation.evaluator?.uid;

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (evaluation.source === 'sign') {
			logger.info(`Skipping delete trigger for Sign app evaluation ${event.data.id}`);

			return;
		}

		if (!statementId) {
			throw new Error('statementId is required');
		}

		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: -1 * evaluationValue,
			addEvaluator: 0, // Will be calculated in updateStatementEvaluation
			action: ActionTypes.delete,
			newEvaluation: 0,
			oldEvaluation: evaluationValue,
			userId,
			parentId: evaluation.parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);
	} catch (error) {
		logger.error('Error in deleteEvaluation:', error);
	}
}
