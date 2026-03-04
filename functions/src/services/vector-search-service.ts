import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Statement } from '@freedi/shared-types';
import { embeddingService, EMBEDDING_DIMENSIONS } from './embedding-service';
import { embeddingCache } from './embedding-cache-service';

interface SimilarStatement {
	statement: Statement;
	similarity: number;
}

interface VectorSearchOptions {
	limit?: number;
	threshold?: number;
	includeHidden?: boolean;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_THRESHOLD = 0.8;

/**
 * Service for performing vector-based similarity search using Firestore
 *
 * Uses Firestore's native vector search (findNearest) for fast, scalable
 * similarity queries on statement embeddings.
 */
class VectorSearchService {
	private db = getFirestore();
	private statementsCollection = 'statements';

	/**
	 * Find statements similar to a text query
	 * @param userInput - The user's input text to find similar statements for
	 * @param parentId - The parent statement ID to search within
	 * @param questionContext - The question context for context-aware embedding
	 * @param options - Search options (limit, threshold)
	 * @returns Array of similar statements with similarity scores
	 */
	async findSimilarToText(
		userInput: string,
		parentId: string,
		questionContext: string,
		options: VectorSearchOptions = {},
	): Promise<SimilarStatement[]> {
		const startTime = Date.now();
		const { limit = DEFAULT_LIMIT, threshold = DEFAULT_THRESHOLD } = options;

		try {
			// Generate embedding for user input
			const { embedding: queryEmbedding } = await embeddingService.generateEmbedding(
				userInput,
				questionContext,
			);

			logger.info('Query embedding generated', {
				userInput: userInput.substring(0, 50),
				embeddingLength: queryEmbedding.length,
			});

			// Perform vector search
			const results = await this.findSimilarByEmbedding(
				queryEmbedding,
				parentId,
				{ limit: limit * 2, threshold }, // Get more to filter by threshold
			);

			const duration = Date.now() - startTime;
			logger.info('Vector similarity search complete', {
				parentId,
				inputLength: userInput.length,
				resultsFound: results.length,
				durationMs: duration,
			});

			return results.slice(0, limit);
		} catch (error) {
			logger.error('Vector similarity search failed', {
				parentId,
				error,
			});
			throw error;
		}
	}

	/**
	 * Find statements similar to a given embedding vector
	 * Uses Firestore's native vector search (findNearest)
	 *
	 * @param queryEmbedding - The embedding vector to search for
	 * @param parentId - The parent statement ID to search within
	 * @param options - Search options
	 * @returns Array of similar statements with similarity scores
	 */
	async findSimilarByEmbedding(
		queryEmbedding: number[],
		parentId: string,
		options: VectorSearchOptions = {},
	): Promise<SimilarStatement[]> {
		const { limit = DEFAULT_LIMIT, threshold = DEFAULT_THRESHOLD, includeHidden = false } = options;

		try {
			// Build the base query - only filter by parentId
			// Don't filter by hide here to avoid complex index requirements
			const query = this.db.collection(this.statementsCollection).where('parentId', '==', parentId);

			// Create vector query using Firestore's findNearest
			// Use distanceResultField to get the distance value in results
			const vectorQuery = query.findNearest({
				vectorField: 'embedding',
				queryVector: FieldValue.vector(queryEmbedding),
				limit: limit * 3, // Get more results to account for hidden filtering
				distanceMeasure: 'COSINE',
				distanceResultField: 'vectorDistance',
			});

			const snapshot = await vectorQuery.get();

			const results: SimilarStatement[] = [];

			for (const doc of snapshot.docs) {
				const data = doc.data() as Statement;

				// Filter hidden statements in code (avoids complex index)
				if (!includeHidden && data.hide === true) {
					continue;
				}

				// Firestore COSINE distance = 1 - cosine_similarity, range [0, 2]
				// Convert back: cosine_similarity = 1 - distance
				const rawData = doc.data() as Record<string, unknown>;

				const distance = typeof rawData.vectorDistance === 'number' ? rawData.vectorDistance : null;

				if (distance === null) {
					logger.warn('Vector search result missing distance', { statementId: data.statementId });
					continue;
				}

				const similarity = 1 - distance; // Cosine similarity = 1 - cosine distance

				logger.info('Vector search result', {
					statementId: data.statementId,
					statement: data.statement?.substring(0, 50),
					distance,
					similarity: similarity.toFixed(3),
					threshold,
					passesThreshold: similarity >= threshold,
				});

				if (similarity >= threshold) {
					results.push({
						statement: data,
						similarity,
					});
				}
			}

			// Sort by similarity descending (should already be, but ensure)
			return results.sort((a, b) => b.similarity - a.similarity);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Check if the error is due to missing vector index
			if (errorMessage.includes('index') || errorMessage.includes('FAILED_PRECONDITION')) {
				logger.error(
					'Vector search failed - likely missing vector index. ' +
						"Run 'firebase deploy --only firestore:indexes' to create it.",
					{ error },
				);
			} else {
				logger.error('Vector search query failed', { error });
			}

			throw error;
		}
	}

	/**
	 * Fallback: Find similar statements using in-memory embedding comparison
	 * Used when vector index is not available or for small datasets
	 *
	 * @param queryEmbedding - The embedding to search for
	 * @param parentId - The parent statement ID
	 * @param options - Search options
	 * @returns Array of similar statements
	 */
	async findSimilarInMemory(
		queryEmbedding: number[],
		parentId: string,
		options: VectorSearchOptions = {},
	): Promise<SimilarStatement[]> {
		const { limit = DEFAULT_LIMIT, threshold = DEFAULT_THRESHOLD } = options;

		try {
			// Get all statements with embeddings for this parent
			const statementsWithEmbeddings = await embeddingCache.getEmbeddingsForParent(parentId);

			if (statementsWithEmbeddings.length === 0) {
				logger.info('No statements with embeddings found for parent', { parentId });

				return [];
			}

			// Get full statement data for the ones with embeddings
			const statementIds = statementsWithEmbeddings.map((s) => s.statementId);
			const results: SimilarStatement[] = [];

			// Batch fetch statement documents
			for (let i = 0; i < statementIds.length; i += 30) {
				const batch = statementIds.slice(i, i + 30);
				const snapshot = await this.db
					.collection(this.statementsCollection)
					.where('statementId', 'in', batch)
					.get();

				for (const doc of snapshot.docs) {
					const statement = doc.data() as Statement;
					const embeddingData = statementsWithEmbeddings.find((s) => s.statementId === doc.id);

					if (embeddingData) {
						const similarity = embeddingService.cosineSimilarity(
							queryEmbedding,
							embeddingData.embedding,
						);

						if (similarity >= threshold) {
							results.push({
								statement,
								similarity,
							});
						}
					}
				}
			}

			// Sort by similarity and limit
			return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
		} catch (error) {
			logger.error('In-memory similarity search failed', { parentId, error });
			throw error;
		}
	}

	/**
	 * Check if vector search is available (index exists and is ready)
	 * @returns true if vector search can be used
	 */
	async isVectorSearchAvailable(): Promise<boolean> {
		try {
			// Try a minimal vector search to check if index is ready
			const testQuery = this.db.collection(this.statementsCollection).limit(1);

			// Create a dummy embedding matching actual dimensions
			const dummyEmbedding = new Array(EMBEDDING_DIMENSIONS).fill(0);

			const vectorQuery = testQuery.findNearest({
				vectorField: 'embedding',
				queryVector: FieldValue.vector(dummyEmbedding),
				limit: 1,
				distanceMeasure: 'COSINE',
			});

			await vectorQuery.get();

			return true;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.includes('index') || errorMessage.includes('FAILED_PRECONDITION')) {
				logger.warn('Vector index not available', { error: errorMessage });

				return false;
			}

			// Re-throw other errors
			throw error;
		}
	}

	/**
	 * Get statistics about embedding coverage
	 * @param parentId - The parent statement ID
	 * @returns Coverage statistics
	 */
	async getSearchReadiness(parentId: string): Promise<{
		isReady: boolean;
		hasVectorIndex: boolean;
		coveragePercent: number;
		totalStatements: number;
		withEmbeddings: number;
	}> {
		const [hasVectorIndex, coverage] = await Promise.all([
			this.isVectorSearchAvailable().catch(() => false),
			embeddingCache.getEmbeddingCoverage(parentId),
		]);

		const isReady = hasVectorIndex && coverage.coveragePercent >= 50;

		return {
			isReady,
			hasVectorIndex,
			coveragePercent: coverage.coveragePercent,
			totalStatements: coverage.totalStatements,
			withEmbeddings: coverage.withEmbeddings,
		};
	}
}

// Export singleton instance
export const vectorSearchService = new VectorSearchService();

// Also export class for testing
export { VectorSearchService };
