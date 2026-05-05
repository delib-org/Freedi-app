import { vectorSearchService } from './vector-search-service';
import { embeddingCache } from './embedding-cache-service';
import { logError } from '../utils/errorHandling';

/**
 * Generalized similarity-grouping primitive used by:
 *   - the bulk idea-synthesis pipeline (chunked all-pairs candidate generation)
 *   - the per-idea suggestion flow (single-query degenerate case)
 *
 * Wraps Firestore's native vector search (`findNearest`) on the
 * `(parentId, embedding)` flat vector index. For each input candidate id,
 * the service queries top-K neighbors above the cosine threshold and emits
 * undirected candidate edges. Caller is responsible for downstream LLM-as-
 * judge verification — see semantic-equivalence-service.
 *
 * See docs/papers/idea-synthesis-paper.md §2.5.
 */

export interface CandidateEdge {
	/** Lexicographically smaller statement id. */
	a: string;
	/** Lexicographically larger statement id. */
	b: string;
	/** Cosine similarity in [0, 1]. */
	cosine: number;
}

export interface BuildCandidateEdgesOptions {
	parentId: string;
	threshold?: number; // default 0.90
	k?: number; // top-K neighbors per query, default 20
}

const DEFAULT_THRESHOLD = 0.9;
const DEFAULT_K = 20;

/**
 * For each candidate, query the vector index for its top-K neighbors above
 * `threshold`, and return the deduplicated undirected edge set.
 *
 * Skips candidates whose embedding cannot be loaded (logs and continues).
 * Self-loops are filtered. Edges are canonicalized (a < b).
 */
export async function buildCandidateEdges(
	candidateIds: string[],
	options: BuildCandidateEdgesOptions,
): Promise<CandidateEdge[]> {
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const k = options.k ?? DEFAULT_K;

	if (candidateIds.length === 0) return [];

	const embeddings = await embeddingCache.getBatchEmbeddings(candidateIds);

	const edgeMap = new Map<string, CandidateEdge>();

	for (const candidateId of candidateIds) {
		const embedding = embeddings.get(candidateId);
		if (!embedding) {
			// Not having an embedding is recoverable; the caller should arrange a
			// backfill before running synthesis (the paper requires ≥90% coverage).
			continue;
		}

		try {
			const results = await vectorSearchService.findSimilarByEmbedding(embedding, options.parentId, {
				limit: k,
				threshold,
			});

			for (const result of results) {
				const otherId = result.statement.statementId;
				if (!otherId || otherId === candidateId) continue;
				const cosine = result.similarity;
				if (typeof cosine !== 'number' || cosine < threshold) continue;

				const [a, b] = candidateId < otherId ? [candidateId, otherId] : [otherId, candidateId];
				const key = `${a}|${b}`;
				const existing = edgeMap.get(key);
				if (!existing || cosine > existing.cosine) {
					edgeMap.set(key, { a, b, cosine });
				}
			}
		} catch (error) {
			logError(error, {
				operation: 'similarityGrouping.buildCandidateEdges',
				metadata: { candidateId, parentId: options.parentId },
			});
			// Continue with other candidates rather than aborting the chunk
		}
	}

	return Array.from(edgeMap.values());
}

/**
 * Single-query convenience: find statements similar to one query embedding.
 * This is the degenerate case used by the per-idea suggestion flow. It
 * delegates directly to vectorSearchService — included here so both call
 * sites import a single primitive name.
 */
export async function findSimilarToEmbedding(
	queryEmbedding: number[],
	parentId: string,
	options: { threshold?: number; limit?: number; includeHidden?: boolean } = {},
) {
	return vectorSearchService.findSimilarByEmbedding(queryEmbedding, parentId, {
		threshold: options.threshold ?? DEFAULT_THRESHOLD,
		limit: options.limit ?? DEFAULT_K,
		includeHidden: options.includeHidden,
	});
}
