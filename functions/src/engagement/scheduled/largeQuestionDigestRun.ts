/**
 * Hourly run for large-question digests, kept apart from `sendDailyDigests` so a
 * busy hour here can never time out or re-run people's personal digests.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import { processLargeQuestionDigests } from '../../notifications/largeQuestionDigest';
import {
	deliverDueDigestItems,
	sweepDigestItems,
} from '../../notifications/largeQuestionDigestDelivery';
import { logError } from '../../utils/errorHandling';

export const LARGE_QUESTION_DIGEST_TIMEOUT_SECONDS = 540;

/** Stops taking work with a minute to spare before the function is cut off. */
export const LARGE_QUESTION_DIGEST_TIME_BUDGET_MS = 480 * 1000;

/** Each stage is guarded, so a failure in one does not cost the other its turn. */
export async function runLargeQuestionDigests(
	db: Firestore,
	startedAt: number,
	clock: () => number = Date.now,
): Promise<void> {
	const hasTime = (): boolean => clock() - startedAt < LARGE_QUESTION_DIGEST_TIME_BUDGET_MS;

	// Rescue comes first and is bounded, so a backlog of digests waiting out quiet
	// hours, which is last and carries over to the next run, cannot crowd it out.
	try {
		await sweepDigestItems(db, hasTime);
	} catch (error) {
		logError(error, { operation: 'engagement.runLargeQuestionDigests.sweep' });
	}

	try {
		await processLargeQuestionDigests(db, startedAt, hasTime);
	} catch (error) {
		logError(error, { operation: 'engagement.runLargeQuestionDigests.markers' });
	}

	try {
		await deliverDueDigestItems(db, startedAt, hasTime);
	} catch (error) {
		logError(error, { operation: 'engagement.runLargeQuestionDigests.due' });
	}
}

export const sendLargeQuestionDigests = onSchedule(
	{
		schedule: '0 * * * *',
		timeZone: 'UTC',
		timeoutSeconds: LARGE_QUESTION_DIGEST_TIMEOUT_SECONDS,
		memory: '512MiB',
		region: functionConfig.region,
	},
	async (): Promise<void> => {
		await runLargeQuestionDigests(getFirestore(), Date.now());
	},
);
