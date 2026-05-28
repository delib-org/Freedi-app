import { logger } from 'firebase-functions';
import type { Statement } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';
import { embeddingService } from '../../services/embedding-service';

const EMBEDDING_FETCH_TIMEOUT_MS = 5_000;

/**
 * Wait briefly for the embedding to land in the cache (race with the upstream
 * `generateEmbeddingForStatement` task that fires from the same onCreate
 * trigger). Falls through to generating it ourselves if the wait expires.
 *
 * Lifted from the original liveSynth implementation so all entry points can
 * share the same embedding-resolution behavior.
 *
 * IMPORTANT — context must be the parent's TEXT, not its ID. All stored
 * embeddings on existing statements are produced by `generateEmbeddingForStatement`
 * (in fn_statementCreation.ts) using `parent.statement` as context. The
 * embedding service concatenates context into the prompt as
 * `"Question: <context>\nAnswer: <text>"`, so passing a Firestore doc id puts
 * the inline-fallback vector in a different subspace from the stored vectors
 * — observed effect: every cross-cosine collapses to ~0.65 even for true
 * paraphrases, and Pass 1 attach can never fire. The pipeline supplies the
 * parent statement via `parentText`; older callers that don't may end up with
 * a contextless embedding (still acceptable, just less precise).
 */
export async function ensureEmbedding(
	statement: Statement,
	parentText?: string,
): Promise<number[] | null> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < EMBEDDING_FETCH_TIMEOUT_MS) {
		const map = await embeddingCache.getBatchEmbeddings([statement.statementId]);
		const cached = map.get(statement.statementId);
		if (cached && cached.length > 0) return cached;
		await new Promise((r) => setTimeout(r, 500));
	}
	logger.info('synthesis.pipeline.ensureEmbedding: not in cache, generating directly', {
		statementId: statement.statementId,
		hasParentText: Boolean(parentText),
	});
	try {
		const result = await embeddingService.generateEmbedding(
			statement.statement,
			parentText ?? '',
		);

		return result.embedding;
	} catch (error) {
		logger.warn('synthesis.pipeline.ensureEmbedding: generation failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}
