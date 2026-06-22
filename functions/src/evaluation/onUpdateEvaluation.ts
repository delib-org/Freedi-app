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
import { ActionTypes } from './evaluationTypes';
import { updateStatementEvaluation } from './statementEvaluationUpdater';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';
import { markHybridEmbeddingStale } from '../services/hybrid-vector-service';
import { writeHistoryEntry } from '../statements/history/writeHistoryEntry';
import { isResearchEnabledForTopParent } from '../statements/history/isResearchEnabled';
// Ship 3a: cluster-aware polarization. See onCreateEvaluation.ts for the
// rationale. Same fail-open enqueue path on update.
import { synthesisFlags } from '../synthesis/featureFlags';
import {
	enqueueClusterRecompute,
	findClustersContainingMember,
} from '../synthesis/liveSynth/clusterRecompute';

export async function updateEvaluation(
	event: FirestoreEvent<Change<DocumentSnapshot>>,
): Promise<void> {
	try {
		const eventId = event.id;

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

		const { statement, duplicate } = await updateStatementEvaluation({
			statementId: after.statementId,
			evaluationDiff,
			action: ActionTypes.update,
			newEvaluation: after.evaluation,
			oldEvaluation: before.evaluation,
			userId,
			parentId: after.parentId,
			eventId,
		});

		// Duplicate at-least-once delivery: increment already applied; skip side-effects.
		if (duplicate) {
			logger.info(`Skipping duplicate update event ${eventId}`);

			return;
		}

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		// Update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: after.evaluation || 0,
			demographicAnchorId: after.demographicAnchorId,
		};
		updateUserDemographicEvaluation(statement, userEvalData);

		// Ship 3a: enqueue cluster recompute(s) when this statement belongs to
		// any synth cluster. Same pattern as onCreateEvaluation. Behind
		// `clusterAwarePolarization` flag — when OFF, no cluster work happens.
		if (synthesisFlags.clusterAwarePolarization) {
			findClustersContainingMember(statement.statementId)
				.then(async (containingClusters) => {
					await Promise.all(
						containingClusters.map((c) =>
							enqueueClusterRecompute(c.statementId, 'evaluation:update', userId),
						),
					);
				})
				.catch((err) =>
					logger.warn('cluster-aware polarization enqueue failed (update)', {
						statementId: statement.statementId,
						error: err instanceof Error ? err.message : String(err),
					}),
				);
		}

		// Mark hybrid embedding as stale (non-blocking)
		markHybridEmbeddingStale(after.statementId).catch((err) =>
			logger.warn('Hybrid stale marking failed:', err),
		);

		// Research-mode: record per-evaluation history (aggregate only, no user info)
		isResearchEnabledForTopParent(statement.topParentId)
			.then((isResearch) => {
				if (!isResearch) return;

				return writeHistoryEntry({
					statement,
					source: 'evaluation-change',
					isResearch: true,
					evaluationDelta: evaluationDiff,
					evaluationAction: 'update',
				});
			})
			.catch((err) => logger.warn('[statementHistory] update write failed:', err));
	} catch (error) {
		logger.error('Error in updateEvaluation:', error);
	}
}
