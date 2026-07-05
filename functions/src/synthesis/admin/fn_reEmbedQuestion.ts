import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { embeddingService } from '../../services/embedding-service';
import { embeddingCache } from '../../services/embedding-cache-service';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Admin-initiated "Re-embed" — regenerate the embedding for every real option
 * under a question, overwriting the stored vector.
 *
 * Why this exists: embeddings are now built from a distilled "brief" of the
 * option (see brief-service) instead of the full text — the original statement
 * text is never changed. Options embedded before that change still carry
 * full-text vectors, so clustering compares apples to oranges. This forces a
 * fresh brief-based embedding for the whole question so a
 * subsequent re-cluster / global-cluster run sees consistent geometry.
 *
 * Skips cluster/derived docs and hidden options — only genuine user options are
 * re-embedded. Synchronous; concurrency-capped so a few hundred options finish
 * within the 540s budget.
 */

interface ReEmbedRequest {
	questionId: string;
}

interface ReEmbedResponse {
	total: number;
	embedded: number;
	skipped: number;
	failed: number;
}

const CONCURRENCY = 8;

export const reEmbedQuestion = onCall<ReEmbedRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ReEmbedResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		const question = await assertSynthesisAdmin(questionId, uid);
		const context = question.statement || '';
		const db = getFirestore();

		const snap = await db
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		const targets: Statement[] = [];
		for (const doc of snap.docs) {
			const option = doc.data() as Statement;
			if (option.isCluster === true) continue;
			if (option.hide === true) continue;
			if (!option.statement || option.statement.trim().length < 3) continue;
			targets.push(option);
		}

		const limit = pLimit(CONCURRENCY);
		let embedded = 0;
		let failed = 0;
		await Promise.all(
			targets.map((option) =>
				limit(async () => {
					try {
						const result = await embeddingService.generateEmbeddingWithRetry(
							option.statement,
							context,
						);
						await embeddingCache.saveEmbedding(
							option.statementId,
							result.embedding,
							context,
							option.statement,
							result.brief,
						);
						embedded++;
					} catch (error) {
						failed++;
						logger.warn('reEmbedQuestion: option failed', {
							questionId,
							optionId: option.statementId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}),
			),
		);

		const response: ReEmbedResponse = {
			total: snap.size,
			embedded,
			skipped: snap.size - targets.length,
			failed,
		};
		logger.info('reEmbedQuestion.complete', { questionId, uid, ...response });

		return response;
	},
);
