/**
 * Social Proof Trigger - Phase 2
 *
 * Detects evaluation milestones on user's options and triggers
 * SOCIAL_PROOF notifications.
 *
 * Milestones: 5th, 10th, 25th, 50th evaluator on a user's option.
 * Also detects consensus shifts > 15%.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
} from '@freedi/shared-types';
import type { NotificationQueueItem, Statement } from '@freedi/shared-types';

const db = getFirestore();

/** Evaluation count milestones that trigger notifications */
const MILESTONES = [5, 10, 25, 50, 100];

/**
 * Check if a statement's evaluation count hit a milestone.
 * Called after an evaluation is processed.
 */
export async function checkSocialProofMilestone(
	statement: Statement,
	newEvaluatorCount: number,
): Promise<void> {
	try {
		// Only notify for options (not questions or groups)
		if (statement.statementType !== 'option') return;

		// Check if we hit a milestone
		const milestone = MILESTONES.find((m) => newEvaluatorCount === m);
		if (!milestone) return;

		// Get the option creator
		const creatorId = statement.creator?.uid;
		if (!creatorId) return;

		const queueItemId = `social_${statement.statementId}_${milestone}_${Date.now()}`;
		const optionPreview =
			statement.statement.substring(0, 60) +
			(statement.statement.length > 60 ? '...' : '');

		const notification: NotificationQueueItem = {
			queueItemId,
			userId: creatorId,
			title: 'Your idea is getting attention!',
			body: `${milestone} people have evaluated your option: "${optionPreview}"`,
			channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
			sourceApp: SourceApp.MAIN,
			targetPath: `/statement/${statement.parentId}?focusId=${statement.statementId}`,
			deliverAt: null,
			frequency: NotificationFrequency.INSTANT,
			triggerType: NotificationTriggerType.SOCIAL_PROOF,
			statementId: statement.statementId,
			parentId: statement.parentId,
			topParentId: statement.topParentId,
			status: NotificationQueueStatus.PENDING,
			createdAt: Date.now(),
		};

		await db.collection(Collections.notificationQueue).doc(queueItemId).set(notification);

		logger.info(`Social proof milestone ${milestone} for statement ${statement.statementId}`);
	} catch (error) {
		// Non-blocking
		logger.warn('Social proof check failed', {
			statementId: statement.statementId,
			error,
		});
	}
}

/**
 * Check if consensus on a statement shifted significantly.
 * Called when consensus value is recalculated.
 *
 * @param statement - The statement with updated consensus
 * @param previousConsensus - The previous consensus value
 */
export async function checkConsensusShift(
	statement: Statement,
	previousConsensus: number,
): Promise<void> {
	try {
		const currentConsensus = statement.consensus ?? 0;
		const shift = Math.abs(currentConsensus - previousConsensus);

		// Only trigger if shift > 15%
		if (shift < 0.15) return;

		// Only notify option creators
		if (statement.statementType !== 'option') return;

		const creatorId = statement.creator?.uid;
		if (!creatorId) return;

		const direction = currentConsensus > previousConsensus ? 'increased' : 'decreased';
		const shiftPercent = Math.round(shift * 100);
		const optionPreview =
			statement.statement.substring(0, 60) +
			(statement.statement.length > 60 ? '...' : '');

		const queueItemId = `consensus_${statement.statementId}_${Date.now()}`;
		const notification: NotificationQueueItem = {
			queueItemId,
			userId: creatorId,
			title: 'Consensus shift on your option',
			body: `Agreement ${direction} by ${shiftPercent}% on: "${optionPreview}"`,
			channels: [NotificationChannel.IN_APP],
			sourceApp: SourceApp.MAIN,
			targetPath: `/statement/${statement.parentId}?focusId=${statement.statementId}`,
			deliverAt: null,
			frequency: NotificationFrequency.INSTANT,
			triggerType: NotificationTriggerType.CONSENSUS_SHIFT,
			statementId: statement.statementId,
			parentId: statement.parentId,
			topParentId: statement.topParentId,
			status: NotificationQueueStatus.PENDING,
			createdAt: Date.now(),
		};

		await db.collection(Collections.notificationQueue).doc(queueItemId).set(notification);

		logger.info(`Consensus shift ${direction} ${shiftPercent}% on ${statement.statementId}`);
	} catch (error) {
		logger.warn('Consensus shift check failed', {
			statementId: statement.statementId,
			error,
		});
	}
}
