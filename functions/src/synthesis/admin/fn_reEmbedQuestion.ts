import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import pLimit from 'p-limit';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { embeddingService } from '../../services/embedding-service';
import { embeddingCache } from '../../services/embedding-cache-service';
import {
	ALLOWED_EMBEDDING_MODELS,
	invalidateEmbeddingModelCache,
	isAllowedEmbeddingModel,
} from '../../services/embedding-model-resolver';
import { LARGE_MODEL_BANDS } from '../pipeline/types';
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
 * IT IS ALSO THE MODEL-MIGRATION ENTRY POINT. Passing `embeddingModel` pins
 * that model on the question (`statementSettings.synthesis.embeddingModel`)
 * and re-embeds everything with it — the decided per-question Hebrew rollout
 * (a named question moves to `text-embedding-3-large`, the rest of the corpus
 * stays put). The pin is written BEFORE the re-embed starts, so statements
 * arriving mid-migration already embed with the new model rather than adding
 * to the stale set. Until the sweep finishes, mixed-model vectors coexist
 * under the question; the model guard makes that degrade (stale vectors read
 * as absent) rather than corrupt. Cluster docs' title vectors are left to the
 * same degrade-then-heal path — the recompute sweep regenerates them.
 *
 * Skips cluster/derived docs and hidden options — only genuine user options are
 * re-embedded. Synchronous; concurrency-capped so a few hundred options finish
 * within the 540s budget.
 */

interface ReEmbedRequest {
	questionId: string;
	/** Pin this model on the question and re-embed with it. Omit to keep the current model. */
	embeddingModel?: string;
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
		const { questionId, embeddingModel } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');
		if (embeddingModel !== undefined && !isAllowedEmbeddingModel(embeddingModel)) {
			throw new HttpsError(
				'invalid-argument',
				`embeddingModel must be one of: ${ALLOWED_EMBEDDING_MODELS.join(', ')}`,
			);
		}

		const question = await assertSynthesisAdmin(questionId, uid);
		const context = question.statement || '';
		const db = getFirestore();

		if (embeddingModel) {
			// Pin first, then re-embed: a statement arriving mid-sweep resolves
			// the NEW model and doesn't add to the stale set. Dot-path update so
			// the rest of the synthesis settings block is untouched.
			//
			// The cosine bands travel WITH the model. They are calibrated to a
			// geometry (types.ts documents both sets), and an admin-saved
			// settings block stores explicit band values that would otherwise
			// win the merge and leave a migrated question judging 3-large
			// cosines by 3-small cuts — the exact mis-calibration that built
			// the 45-member mega-theme in `he-seed42-large-perq` (Finding 17).
			// Pinning is an explicit migration action; stale bands are wrong by
			// construction, so they are overwritten, not respected.
			const bandUpdate =
				embeddingModel === 'text-embedding-3-large'
					? Object.fromEntries(
							Object.entries(LARGE_MODEL_BANDS).map(([k, v]) => [
								`statementSettings.synthesis.${k}`,
								v,
							]),
						)
					: {};
			await db
				.collection(Collections.statements)
				.doc(questionId)
				.update({
					'statementSettings.synthesis.embeddingModel': embeddingModel,
					...bandUpdate,
					lastUpdate: Date.now(),
				});
			invalidateEmbeddingModelCache(questionId);
			logger.info('reEmbedQuestion: embedding model pinned', {
				questionId,
				embeddingModel,
				bands: bandUpdate,
				uid,
			});
		}

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
						// parentId (not a hardcoded model): the freshly-written pin is
						// what resolves, and a plain re-embed with no pin keeps using
						// whatever the question already uses.
						const result = await embeddingService.generateEmbeddingWithRetry(
							option.statement,
							context,
							3,
							{ parentId: questionId },
						);
						await embeddingCache.saveEmbedding(
							option.statementId,
							result.embedding,
							context,
							option.statement,
							result.brief,
							result.model,
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
