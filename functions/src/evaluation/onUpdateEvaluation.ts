/**
 * Firestore onUpdate trigger handler for evaluations.
 *
 * Processes evaluation changes, calculates the evaluation diff,
 * updates the target statement, refreshes parent chosen options,
 * and triggers demographic evaluation updates.
 */

import { Change, logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import type { Evaluation } from '@freedi/shared-types';
import { updateUserDemographicEvaluation } from '../fn_polarizationIndex';
import { ActionTypes, isEventAlreadyProcessed, markEventAsProcessed } from './evaluationTypes';
import { updateStatementEvaluation } from './statementEvaluationUpdater';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';

export async function updateEvaluation(
	event: FirestoreEvent<Change<DocumentSnapshot>>,
): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate update event ${eventId}`);

			return;
		}
		markEventAsProcessed(eventId);

		const before = event.data.before.data() as Evaluation;
		const after = event.data.after.data() as Evaluation & { source?: string };

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (after.source === 'sign') {
			logger.info(`Skipping update trigger for Sign app evaluation ${event.data.after.id}`);

			return;
		}

		const evaluationDiff = after.evaluation - before.evaluation;
		const userId = after.evaluator?.uid;

		if (!userId) {
			throw new Error('User ID is required');
		}

		if (!after.statementId) {
			throw new Error('statementId is required');
		}

		const statement = await updateStatementEvaluation({
			statementId: after.statementId,
			evaluationDiff,
			action: ActionTypes.update,
			newEvaluation: after.evaluation,
			oldEvaluation: before.evaluation,
			userId,
			parentId: after.parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		// Update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: after.evaluation || 0,
		};
		updateUserDemographicEvaluation(statement, userEvalData);
	} catch (error) {
		logger.error('Error in updateEvaluation:', error);
	}
}
