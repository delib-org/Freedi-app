import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from './db';
import {
	Collections,
	Statement,
	ReplacementQueueStatus,
} from '@freedi/shared-types';

/**
 * Cloud Function: Update Queue Consensus
 *
 * Triggers when a suggestion's consensus changes.
 * Updates the corresponding queue item's consensus in real-time.
 *
 * MVP Features:
 * - Real-time denormalization of consensus to queue items
 * - Enhanced logging with delta tracking
 * - Non-blocking (errors don't throw)
 */
export const fn_updateQueueConsensus = onDocumentUpdated(
	`${Collections.statements}/{suggestionId}`,
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement;
			const after = event.data?.after.data() as Statement;

			if (!before || !after) {
				return null;
			}

			// Only if consensus changed
			if (before.consensus === after.consensus) {
				return null;
			}

			// Calculate delta for enhanced logging
			const consensusDelta = after.consensus - before.consensus;

			// Find queue item for this suggestion
			const queueSnap = await db
				.collection(Collections.paragraphReplacementQueue)
				.where('suggestionId', '==', event.params.suggestionId)
				.where('status', '==', ReplacementQueueStatus.pending)
				.limit(1)
				.get();

			if (queueSnap.empty) {
				// No queue item found - this is normal if suggestion hasn't reached threshold yet
				return null;
			}

			// Update consensus in real-time
			const queueDoc = queueSnap.docs[0];
			await queueDoc.ref.update({
				consensus: after.consensus,
				evaluationCount: after.totalEvaluators || 0,
			});

			logger.info('[fn_updateQueueConsensus] Queue consensus updated', {
				queueId: queueDoc.id,
				suggestionId: event.params.suggestionId,
				previousConsensus: before.consensus,
				newConsensus: after.consensus,
				delta: consensusDelta,
				evaluationCount: after.totalEvaluators || 0,
			});

			return null;
		} catch (error) {
			logger.error('[fn_updateQueueConsensus] Error', {
				error: error instanceof Error ? error.message : String(error),
				suggestionId: event.params.suggestionId,
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Don't throw - this is non-critical real-time update
			return null;
		}
	}
);
