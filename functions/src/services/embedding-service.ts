import OpenAI from 'openai';
import { logger } from 'firebase-functions';
import { notifyAIError } from './error-notification-service';
import { generateBrief, briefEmbeddingsEnabled } from './brief-service';
import { DEFAULT_EMBEDDING_MODEL, resolveEmbeddingModel } from './embedding-model-resolver';

// OpenAI embedding configuration.
//
// The 1536 dimension count is NOT free to change: the Firestore vector indexes in
// firestore.indexes.json declare `"dimension": 1536`, so any model swap must keep
// that width. OpenAI's v3 models accept an explicit `dimensions` argument and
// truncate natively, so a larger model can still be used at 1536.
//
// On multilingual quality — text-embedding-3-small is markedly WORSE at Hebrew than
// this file previously claimed. Measured on the 100-statement EN/HE accuracy
// benchmark (scientific-research/2026-08-18-live-synth-accuracy), asking how often a
// statement's true paraphrase is its nearest neighbour:
//
//                                    English      Hebrew
//   text-embedding-3-small           100/100       56/100
//   text-embedding-3-large @1536     100/100       88/100
//
// With 3-small only 79/100 Hebrew partners even fall inside the 10-neighbour window
// the pipeline inspects, which caps Hebrew pair recall no matter how the thresholds
// are set.
//
// The model is now resolvable PER QUESTION (embedding-model-resolver.ts): callers
// that know which question a text belongs to pass `parentId` in EmbedOptions and
// the question's pinned model — if any — is used. The env override remains the
// global default for questions with no pin.
const OPENAI_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
const EMBEDDING_DIMENSIONS = 1536;

/**
 * How the model is chosen for one embedding call, in priority order:
 * `model` (explicit) → the question's pinned model via `parentId` → global
 * default. Callers on statement paths should pass `parentId` — it is what
 * keeps a migrated question's new vectors comparable with its stored ones.
 */
interface EmbedOptions {
	parentId?: string | null;
	model?: string;
}

async function chooseModel(options?: EmbedOptions): Promise<string> {
	if (options?.model) return options.model;

	return resolveEmbeddingModel(options?.parentId);
}

interface EmbeddingResult {
	embedding: number[];
	model: string;
	dimensions: number;
	/**
	 * The distilled brief actually embedded, when brief embeddings are enabled.
	 * This is a SEPARATE short text — the original statement is never changed.
	 */
	brief?: string;
}

interface APIError {
	status?: number;
	statusText?: string;
	code?: string;
	message?: string;
}

/**
 * Get OpenAI client instance
 */
function getOpenAI(): OpenAI {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error('Missing OPENAI_API_KEY environment variable');
	}

	return new OpenAI({ apiKey });
}

/**
 * Embedding Service for generating vector embeddings using OpenAI
 *
 * Uses text-embedding-3-small model which produces 1536-dimensional vectors.
 * Supports multilingual text including Hebrew and Arabic.
 */
class EmbeddingService {
	/**
	 * Generate embedding for a single text
	 * @param text - The text to embed
	 * @param context - Optional context (e.g., parent question) for context-aware embedding
	 * @returns EmbeddingResult with embedding vector
	 */
	async generateEmbedding(
		text: string,
		context?: string,
		options?: EmbedOptions,
	): Promise<EmbeddingResult> {
		const startTime = Date.now();
		const model = await chooseModel(options);

		try {
			const openai = getOpenAI();

			// Embed a distilled "brief" instead of the full text so similar ideas
			// cluster instead of blobbing on shared boilerplate (see brief-service).
			// This does NOT change the original statement — `text` is only the
			// source we derive the brief from. Fail-open: generateBrief returns the
			// original text on any error.
			const useBrief = briefEmbeddingsEnabled();
			const answerText = useBrief ? await generateBrief(text, context) : text;

			// Combine text with context for context-aware embedding
			// This helps the embedding capture meaning relative to the question
			// Context must ALWAYS be applied to match stored embeddings (which all have context)
			const input = context ? `Question: ${context}\nAnswer: ${answerText}` : answerText;

			logger.info('OpenAI Embedding API input', {
				inputPreview: input.substring(0, 100),
				inputLength: input.length,
				text: text.substring(0, 50),
				hasContext: !!context,
				model,
			});

			// Call OpenAI embeddings API
			const response = await openai.embeddings.create({
				model,
				input: input,
				// Pinned, not implied: the Firestore vector indexes declare 1536, and
				// a model whose native width differs would silently break them.
				dimensions: EMBEDDING_DIMENSIONS,
			});

			const embedding = response.data[0].embedding;

			const duration = Date.now() - startTime;
			logger.info('Embedding generated successfully', {
				textLength: text.length,
				hasContext: !!context,
				dimensions: embedding.length,
				durationMs: duration,
				firstValues: embedding.slice(0, 5).map((v) => v.toFixed(6)),
				model,
			});

			return {
				embedding,
				model,
				dimensions: embedding.length,
				brief: useBrief ? answerText : undefined,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);

			logger.error('Failed to generate embedding', {
				error: errorMessage,
				textLength: text.length,
				hasContext: !!context,
			});

			// Notify admin of embedding errors
			notifyAIError(errorMessage, {
				model,
				prompt: text.substring(0, 100),
				functionName: 'embedding-service.generateEmbedding',
			}).catch((notifyError) => {
				logger.warn('Failed to send embedding error notification', {
					notifyError,
				});
			});

			throw error;
		}
	}

	/**
	 * Generate embeddings for multiple texts in batch
	 * Uses OpenAI's batch embedding capability for efficiency
	 *
	 * @param texts - Array of texts to embed
	 * @param context - Optional shared context for all texts
	 * @param batchSize - Number of texts per API call (default: 100, OpenAI supports up to 2048)
	 * @returns Array of EmbeddingResults in same order as input
	 */
	async generateBatchEmbeddings(
		texts: string[],
		context?: string,
		batchSize: number = 100,
		options?: EmbedOptions,
	): Promise<EmbeddingResult[]> {
		if (texts.length === 0) {
			return [];
		}

		const startTime = Date.now();
		const model = await chooseModel(options);
		const results: EmbeddingResult[] = [];
		const openai = getOpenAI();

		logger.info(`Starting batch embedding generation for ${texts.length} texts`);

		// Process in batches
		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);

			// Prepare inputs with context
			const inputs = batch.map((text) =>
				context ? `Question: ${context}\nAnswer: ${text}` : text,
			);

			try {
				const response = await openai.embeddings.create({
					model,
					input: inputs,
					dimensions: EMBEDDING_DIMENSIONS,
				});

				// Add results in order
				for (const item of response.data) {
					results.push({
						embedding: item.embedding,
						model,
						dimensions: item.embedding.length,
					});
				}
			} catch (error) {
				logger.error(`Failed to generate batch embeddings at index ${i}:`, error);
				// For failed batches, try individual processing
				for (const text of batch) {
					try {
						const result = await this.generateEmbedding(text, context, { model });
						results.push(result);
					} catch (individualError) {
						logger.error(`Failed individual embedding:`, individualError);
						// Skip failed embeddings
					}
				}
			}

			// Small delay between batches to avoid rate limiting
			if (i + batchSize < texts.length) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		const duration = Date.now() - startTime;
		logger.info('Batch embedding generation complete', {
			totalTexts: texts.length,
			successfulEmbeddings: results.length,
			failedEmbeddings: texts.length - results.length,
			durationMs: duration,
		});

		return results;
	}

	/**
	 * Calculate cosine similarity between two embedding vectors
	 * @param a - First embedding vector
	 * @param b - Second embedding vector
	 * @returns Similarity score between -1 and 1 (1 = identical, 0 = orthogonal)
	 */
	cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		normA = Math.sqrt(normA);
		normB = Math.sqrt(normB);

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dotProduct / (normA * normB);
	}

	/**
	 * Find top K most similar embeddings from a list
	 * @param queryEmbedding - The embedding to compare against
	 * @param candidates - Array of candidate embeddings with IDs
	 * @param topK - Number of top results to return
	 * @param threshold - Minimum similarity threshold (default: 0.85)
	 * @returns Array of {id, similarity} sorted by similarity descending
	 */
	findTopKSimilar(
		queryEmbedding: number[],
		candidates: Array<{ id: string; embedding: number[] }>,
		topK: number,
		threshold: number = 0.8,
	): Array<{ id: string; similarity: number }> {
		const results: Array<{ id: string; similarity: number }> = [];

		for (const candidate of candidates) {
			const similarity = this.cosineSimilarity(queryEmbedding, candidate.embedding);

			if (similarity >= threshold) {
				results.push({
					id: candidate.id,
					similarity,
				});
			}
		}

		// Sort by similarity descending and take top K
		return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
	}

	/**
	 * Retry wrapper for embedding generation with exponential backoff
	 * @param text - Text to embed
	 * @param context - Optional context
	 * @param maxRetries - Maximum retry attempts (default: 3)
	 * @returns EmbeddingResult or throws after all retries exhausted
	 */
	async generateEmbeddingWithRetry(
		text: string,
		context?: string,
		maxRetries: number = 3,
		options?: EmbedOptions,
	): Promise<EmbeddingResult> {
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await this.generateEmbedding(text, context, options);
			} catch (error) {
				lastError = error;
				const apiError = error as APIError;
				const isRetryable =
					apiError?.status === 503 || apiError?.status === 429 || apiError?.status === 500;

				if (!isRetryable || attempt === maxRetries) {
					logger.error(`Embedding generation failed permanently after ${attempt} attempts`, {
						error,
					});
					break;
				}

				const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
				logger.info(`Embedding attempt ${attempt} failed, retrying in ${waitTime}ms...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}

		throw lastError;
	}
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

// Export constants for other services
export { EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL };

// Also export class for testing
export { EmbeddingService };
