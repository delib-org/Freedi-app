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
 */
export async function ensureEmbedding(statement: Statement): Promise<number[] | null> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < EMBEDDING_FETCH_TIMEOUT_MS) {
		const map = await embeddingCache.getBatchEmbeddings([statement.statementId]);
		const cached = map.get(statement.statementId);
		if (cached && cached.length > 0) return cached;
		await new Promise((r) => setTimeout(r, 500));
	}
	logger.info('synthesis.pipeline.ensureEmbedding: not in cache, generating directly', {
		statementId: statement.statementId,
	});
	try {
		const result = await embeddingService.generateEmbedding(
			statement.statement,
			statement.parentId,
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
