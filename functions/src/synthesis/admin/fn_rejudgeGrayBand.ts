import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { embeddingCache } from '../../services/embedding-cache-service';
import { vectorSearchService } from '../../services/vector-search-service';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { computeMedoid } from '../pipeline/computeMedoid';
import { enqueueItem, initProgressDoc, mergeIntoProgressDoc } from '../queue/enqueue';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Gray-band re-judge — admin operation.
 *
 * For every cluster under this question, compute its medoid, find that
 * medoid's nearest neighbors among other cluster medoids, and for any pair
 * whose cosine lands in [reviewLowerBound, attachThreshold) enqueue a
 * rejudge-medoid-pair item. The queue worker drains those one by one.
 *
 * Pairs are normalized at enqueue (`rj-A-B` regardless of input order) so
 * the operation is naturally idempotent — running it twice produces the
 * same queue as running it once.
 */

interface RejudgeRequest {
	questionId: string;
}

interface RejudgeResponse {
	pairsEnqueued: number;
	clustersScanned: number;
	mergedIntoExistingRun: boolean;
}

const MEDOID_NEIGHBOR_LIMIT = 8;

function db() {
	return getFirestore();
}

async function readProgress(questionId: string): Promise<ProgressDoc | null> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return null;

	return snap.data() as ProgressDoc;
}

export const rejudgeGrayBand = onCall<RejudgeRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<RejudgeResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);

		// Admin-initiated: NOT gated by `settings.enabled` (that controls
		// only the continuous background triggers).
		const settings = await loadSynthesisSettings(questionId);

		// Find all clusters under this question.
		const optionsSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		const clusters = optionsSnap.docs
			.map((d) => d.data() as Statement)
			.filter((s) => Array.isArray(s.integratedOptions) && s.integratedOptions.length > 0);

		if (clusters.length < 2) {
			return { pairsEnqueued: 0, clustersScanned: clusters.length, mergedIntoExistingRun: false };
		}

		// Compute medoid for each cluster (parallel, bounded).
		const medoids = await Promise.all(
			clusters.map(async (c) => {
				const m = await computeMedoid(c);

				return m ? { cluster: c, medoid: m } : null;
			}),
		);
		const validMedoids = medoids.filter(
			(m): m is { cluster: Statement; medoid: Statement } => m !== null,
		);

		// For each medoid, find nearest other medoids in the gray band.
		const enqueuedPairs = new Set<string>();
		const medoidEmbeddings = await embeddingCache.getBatchEmbeddings(
			validMedoids.map((m) => m.medoid.statementId),
		);
		const medoidIdToClusterId = new Map<string, string>(
			validMedoids.map((m) => [m.medoid.statementId, m.cluster.statementId]),
		);

		for (const entry of validMedoids) {
			const embedding = medoidEmbeddings.get(entry.medoid.statementId);
			if (!embedding) continue;
			const neighbors = await vectorSearchService.findSimilarByEmbedding(embedding, questionId, {
				limit: MEDOID_NEIGHBOR_LIMIT,
				threshold: settings.reviewLowerBound,
			});
			for (const n of neighbors) {
				if (n.statement.statementId === entry.medoid.statementId) continue;
				const otherClusterId = medoidIdToClusterId.get(n.statement.statementId);
				if (!otherClusterId) continue;
				if (otherClusterId === entry.cluster.statementId) continue;
				if (n.similarity < settings.reviewLowerBound) continue;
				if (n.similarity >= settings.attachThreshold) continue;
				const a = entry.cluster.statementId;
				const b = otherClusterId;
				const pairKey = [a, b].sort().join('|');
				if (enqueuedPairs.has(pairKey)) continue;
				enqueuedPairs.add(pairKey);
				await enqueueItem({
					questionId,
					kind: 'rejudge-medoid-pair',
					medoidPair: { a, b },
				});
			}
		}

		const enqueuedCount = enqueuedPairs.size;

		const existing = await readProgress(questionId);
		const mergedIntoExistingRun =
			existing !== null && (existing.status === 'running' || existing.status === 'paused');

		if (mergedIntoExistingRun) {
			await mergeIntoProgressDoc(questionId, enqueuedCount, 'rejudge');
		} else {
			await initProgressDoc({
				questionId,
				enqueuedCount,
				operation: 'rejudge',
				initiatedBy: uid,
			});
		}

		logger.info('rejudgeGrayBand.enqueued', {
			questionId,
			uid,
			clustersScanned: clusters.length,
			pairsEnqueued: enqueuedCount,
			mergedIntoExistingRun,
		});

		return {
			pairsEnqueued: enqueuedCount,
			clustersScanned: clusters.length,
			mergedIntoExistingRun,
		};
	},
);
