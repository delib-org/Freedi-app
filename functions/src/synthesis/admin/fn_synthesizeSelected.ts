import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { enqueueItem, initProgressDoc, mergeIntoProgressDoc } from '../queue/enqueue';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';
import { validateOptionIdsBelongToQuestion } from './validateOptionIds';

/**
 * Selective synthesis — admin picks specific option IDs and force-processes
 * them through the pipeline regardless of the engagement threshold. Up to
 * 200 options per call (Firestore IN-query limit × ~7).
 *
 * Behavior when another run is in flight: MERGE into the existing progress
 * doc rather than reject. Admins should be able to add items to an
 * in-progress synthesis without waiting.
 */

const MAX_OPTIONS_PER_CALL = 200;

interface SynthesizeSelectedRequest {
	questionId: string;
	optionIds: string[];
}

interface SynthesizeSelectedResponse {
	enqueued: number;
	skipped: number;
	etaMinutes: number;
	mergedIntoExistingRun: boolean;
}

function db() {
	return getFirestore();
}

async function readProgress(questionId: string): Promise<ProgressDoc | null> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return null;

	return snap.data() as ProgressDoc;
}

export const synthesizeSelected = onCall<SynthesizeSelectedRequest>(
	{
		timeoutSeconds: 120,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<SynthesizeSelectedResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId, optionIds } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');
		if (!Array.isArray(optionIds) || optionIds.length === 0) {
			throw new HttpsError('invalid-argument', 'optionIds must be a non-empty array');
		}
		if (optionIds.length > MAX_OPTIONS_PER_CALL) {
			throw new HttpsError(
				'invalid-argument',
				`optionIds must be <= ${MAX_OPTIONS_PER_CALL} per call (got ${optionIds.length})`,
			);
		}

		await assertSynthesisAdmin(questionId, uid);

		// Admin-initiated: NOT gated by `settings.enabled` (that controls
		// only the continuous background triggers).
		const validIds = await validateOptionIdsBelongToQuestion(optionIds, questionId);
		if (validIds.length === 0) {
			throw new HttpsError('invalid-argument', 'No valid options for this question in the request');
		}
		const skipped = optionIds.length - validIds.length;

		for (const optionId of validIds) {
			await enqueueItem({
				questionId,
				kind: 'process-option',
				optionId,
				forceProcess: true,
			});
		}

		const existing = await readProgress(questionId);
		const mergedIntoExistingRun =
			existing !== null && (existing.status === 'running' || existing.status === 'paused');

		if (mergedIntoExistingRun) {
			await mergeIntoProgressDoc(questionId, validIds.length, 'selective');
		} else {
			await initProgressDoc({
				questionId,
				enqueuedCount: validIds.length,
				operation: 'selective',
				initiatedBy: uid,
			});
		}

		logger.info('synthesizeSelected.enqueued', {
			questionId,
			uid,
			enqueued: validIds.length,
			skipped,
			mergedIntoExistingRun,
		});

		return {
			enqueued: validIds.length,
			skipped,
			etaMinutes: Math.ceil(validIds.length / 50),
			mergedIntoExistingRun,
		};
	},
);
