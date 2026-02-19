/**
 * Firestore onCreate trigger handler for evaluations.
 *
 * Processes new evaluation documents, updates the target statement's
 * evaluation metrics, refreshes parent chosen options, and triggers
 * demographic evaluation updates.
 */

import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import type { Evaluation } from '@freedi/shared-types';
import { updateUserDemographicEvaluation } from '../fn_polarizationIndex';
import { ActionTypes, isEventAlreadyProcessed, markEventAsProcessed } from './evaluationTypes';
import { updateStatementEvaluation } from './statementEvaluationUpdater';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';

export async function newEvaluation(event: FirestoreEvent<DocumentSnapshot>): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate event ${eventId} for evaluation ${event.data.id}`);

			return;
		}
		markEventAsProcessed(eventId);

		const evaluation = event.data.data() as Evaluation & { migratedAt?: number; source?: string };
		const { statementId, parentId } = evaluation;
		const userId = evaluation.evaluator?.uid;

		// Skip processing for migrated evaluations - the migration function handles the statement update
		if (evaluation.migratedAt) {
			logger.info(`Skipping trigger for migrated evaluation ${event.data.id}`);

			return;
		}

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (evaluation.source === 'sign') {
			logger.info(`Skipping trigger for Sign app evaluation ${event.data.id}`);

			return;
		}

		if (!statementId) {
			throw new Error('statementId is required');
		}

		if (!userId) {
			// Log detailed info to help debug missing evaluator data
			logger.error('Missing userId in evaluation', {
				evaluationId: event.data.id,
				statementId,
				parentId,
				hasEvaluator: !!evaluation.evaluator,
				evaluatorKeys: evaluation.evaluator ? Object.keys(evaluation.evaluator) : [],
			});
			throw new Error('User ID is required');
		}

		// Note: The evaluator count is now properly tracked in updateStatementEvaluation
		// which handles the logic for when to actually increment the evaluator count
		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: evaluation.evaluation,
			addEvaluator: 0, // Will be calculated in updateStatementEvaluation
			action: ActionTypes.new,
			newEvaluation: evaluation.evaluation,
			oldEvaluation: 0,
			userId,
			parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		// Update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: evaluation.evaluation || 0,
		};
		updateUserDemographicEvaluation(statement, userEvalData);
	} catch (error) {
		logger.error('Error in newEvaluation:', error);
	}
}
