import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { enqueueItem, initProgressDoc } from '../queue/enqueue';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Admin-initiated "Synthesize" — enqueue every eligible option under this
 * question. Eligible means:
 *   - statementType === option
 *   - parentId === questionId
 *   - not already in a cluster (integratedOptions is empty)
 *   - evaluation count and consensus meet the admin's thresholds
 *
 * Returns in <2 s — only does counting and Firestore writes. The actual
 * work happens in the scheduled queue worker (1 min cadence). The UI
 * subscribes to `synthesisQueue/{questionId}` for live progress.
 */

interface SynthesizeNowRequest {
	questionId: string;
}

interface SynthesizeNowResponse {
	enqueued: number;
	etaMinutes: number;
}

function db() {
	return getFirestore();
}

async function isOperationInFlight(questionId: string): Promise<boolean> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return false;
	const progress = snap.data() as ProgressDoc;

	return progress.status === 'running' || progress.status === 'paused';
}

export const synthesizeNow = onCall<SynthesizeNowRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<SynthesizeNowResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);

		// Admin-initiated on-demand: NOT gated by `settings.enabled`. That
		// flag controls only the continuous background triggers; on-demand
		// is always available to admins.
		const settings = await loadSynthesisSettings(questionId);

		if (await isOperationInFlight(questionId)) {
			throw new HttpsError(
				'already-exists',
				'A synthesis operation is already running for this question',
			);
		}

		// Enumerate eligible options. Skip the "already-clustered" check at the
		// query level — Firestore can't `where('integratedOptions', '==', [])`
		// reliably; we filter in the loop instead.
		const optionsSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		let enqueued = 0;
		let skippedClustered = 0;
		let skippedBelowThreshold = 0;
		for (const optionDoc of optionsSnap.docs) {
			const option = optionDoc.data() as Statement;
			if ((option.integratedOptions ?? []).length > 0) {
				skippedClustered++;
				continue;
			}
			const evals = option.evaluation?.numberOfEvaluators ?? 0;
			const cons = option.consensus ?? 0;
			if (evals < settings.minEvaluators || cons < settings.minConsensus) {
				skippedBelowThreshold++;
				continue;
			}
			await enqueueItem({
				questionId,
				kind: 'process-option',
				optionId: option.statementId,
				forceProcess: false,
			});
			enqueued++;
		}

		await initProgressDoc({
			questionId,
			enqueuedCount: enqueued,
			operation: 'synthesizeNow',
			initiatedBy: uid,
		});

		logger.info('synthesizeNow.enqueued', {
			questionId,
			uid,
			enqueued,
			skippedClustered,
			skippedBelowThreshold,
			totalCandidates: optionsSnap.size,
		});

		return {
			enqueued,
			etaMinutes: Math.ceil(enqueued / 50),
		};
	},
);
