import {
	getFirestore,
	FieldValue,
	type DocumentData,
	type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections } from '@freedi/shared-types';
import { EMBEDDING_DIMENSIONS } from './embedding-service';
import { DEFAULT_EMBEDDING_MODEL, resolveEmbeddingModel } from './embedding-model-resolver';
import { computeTextHash } from '../synthesis/textHash';
import {
	embeddingDocRef,
	embeddingsCollection,
	extractEmbeddingArray,
	hasLegacyEmbeddingFields,
	isLegacyEmbeddingFallbackEnabled,
	isNotFoundError,
	legacyFieldDeletes,
	legacyFieldsForEmbeddingDoc,
	loadEmbeddingDocs,
} from './statement-embedding-store';

/**
 * Is this stored vector comparable with the ones we are producing now?
 *
 * Vectors from `text-embedding-3-small` and `text-embedding-3-large` occupy
 * different spaces, so a cosine between them is a number with no meaning. It is
 * not an error, it does not throw, and it does not look wrong — it just quietly
 * ranks the wrong neighbours first. That is the single hazard blocking the
 * Hebrew model switch, where the measured gain is large (twin visibility 79/100
 * → 99/100, nearest-neighbour 56 → 89) and the risk has been entirely in the
 * transition rather than the destination.
 *
 * Every write has stamped `embeddingModel` for some time, so honouring it costs
 * nothing today — every vector matches and this returns true — and on the day
 * the model changes, a stale vector reads as ABSENT rather than as a peer.
 * `ensureEmbedding` then regenerates it, so a question heals as it is used
 * instead of silently clustering on nonsense.
 *
 * A MISSING stamp is treated as compatible, deliberately. Vectors written
 * before the field existed carry no model, and reading absence as "stale" would
 * re-embed the entire corpus the moment this shipped — a large bill and a long
 * outage to fix a problem nobody has yet. Only a stamp that is present AND
 * different is a mismatch.
 *
 * What "the ones we are producing now" means is PER QUESTION since the model
 * became pinnable per question (embedding-model-resolver.ts): the expected
 * model is resolved from the statement's own parentId, so a migrated
 * question's 3-large vectors read as present under that question while the
 * rest of the corpus still expects 3-small. Reader call sites did not change —
 * the doc itself says which question it belongs to.
 */
function isCompatibleModel(storedModel: unknown, expectedModel: string): boolean {
	if (typeof storedModel !== 'string' || storedModel === '') return true;

	return storedModel === expectedModel;
}

/**
 * The comparable vector in a doc — an embedding doc, or (legacy) a statement
 * doc still carrying the fields — or null when there is none.
 */
async function compatibleVector(data: DocumentData | undefined): Promise<number[] | null> {
	const vector = extractEmbeddingArray(data?.embedding);
	if (!vector) return null;
	const expectedModel = await resolveEmbeddingModel(data?.parentId as string | undefined);

	return isCompatibleModel(data?.embeddingModel, expectedModel) ? vector : null;
}

interface EmbeddingWithStatement {
	statementId: string;
	embedding: number[];
	statement: string;
}

/**
 * Service for storing and retrieving statement embeddings.
 *
 * Vectors live in `statementEmbeddings/{statementId}` (see
 * statement-embedding-store.ts for why they left the statement doc). Readers
 * fall back to the old statement-doc fields until the migration has run, and
 * every write moves whatever legacy fields a statement still carries.
 */
class EmbeddingCacheService {
	// Lazy Firestore handle. Resolved on first use rather than at construction
	// so that importing this module (which constructs the exported singleton
	// at the bottom of the file) doesn't call getFirestore() before
	// admin.initializeApp() has run. Without this, transitively importing
	// the singleton from any bootstrap-path module crashes the function
	// loader with "The default Firebase app does not exist."
	private _db: Firestore | null = null;
	private get db(): Firestore {
		if (!this._db) this._db = getFirestore();

		return this._db;
	}
	private statementsCollection = Collections.statements;

	/**
	 * Get embedding for a single statement
	 * @param statementId - The statement ID
	 * @returns The embedding array or null if not found
	 */
	async getEmbedding(statementId: string): Promise<number[] | null> {
		try {
			const embeddingSnap = await embeddingDocRef(statementId).get();
			let data = embeddingSnap.exists ? embeddingSnap.data() : undefined;

			if (!extractEmbeddingArray(data?.embedding) && isLegacyEmbeddingFallbackEnabled()) {
				const statementSnap = await this.db
					.collection(this.statementsCollection)
					.doc(statementId)
					.get();
				data = statementSnap.exists ? statementSnap.data() : undefined;
			}

			const vector = await compatibleVector(data);
			if (!vector && extractEmbeddingArray(data?.embedding)) {
				logger.info('embeddingCache: ignoring vector from a different model', {
					statementId,
					storedModel: data?.embeddingModel,
				});
			}

			return vector;
		} catch (error) {
			logger.error('Failed to get embedding from cache', {
				statementId,
				error,
			});

			return null;
		}
	}

	/**
	 * Get embeddings for multiple statements
	 * @param statementIds - Array of statement IDs
	 * @returns Map of statementId -> embedding for found embeddings
	 */
	async getBatchEmbeddings(statementIds: string[]): Promise<Map<string, number[]>> {
		const result = new Map<string, number[]>();

		if (statementIds.length === 0) {
			return result;
		}

		try {
			let incompatible = 0;
			const embeddingDocs = await loadEmbeddingDocs(statementIds);
			const withoutDoc: string[] = [];

			for (const id of statementIds) {
				const data = embeddingDocs.get(id);
				if (!extractEmbeddingArray(data?.embedding)) {
					withoutDoc.push(id);
					continue;
				}
				const vector = await compatibleVector(data);
				if (vector) result.set(id, vector);
				else incompatible++;
			}

			if (withoutDoc.length > 0 && isLegacyEmbeddingFallbackEnabled()) {
				// Firestore 'in' query limit is 30, batch if needed
				const batchSize = 30;
				for (let i = 0; i < withoutDoc.length; i += batchSize) {
					const batch = withoutDoc.slice(i, i + batchSize);

					const snapshot = await this.db
						.collection(this.statementsCollection)
						.where('statementId', 'in', batch)
						.get();

					for (const doc of snapshot.docs) {
						const data = doc.data();
						if (!extractEmbeddingArray(data?.embedding)) continue;
						const vector = await compatibleVector(data);
						if (vector) result.set(doc.id, vector);
						else incompatible++;
					}
				}
			}

			if (incompatible > 0) {
				logger.info('embeddingCache: ignored vectors from a different model', {
					count: incompatible,
				});
			}

			logger.info(`Retrieved ${result.size}/${statementIds.length} embeddings`);

			return result;
		} catch (error) {
			logger.error('Failed to get batch embeddings', { error });

			return result;
		}
	}

	/**
	 * The short LLM gist each statement was embedded from (`embeddingBrief`),
	 * where one was stored. Callers fall back to the statement text.
	 */
	async getBriefs(
		statementIds: string[],
		legacyStatements: ReadonlyMap<string, DocumentData> = new Map(),
	): Promise<Map<string, string>> {
		const briefs = new Map<string, string>();
		if (statementIds.length === 0) return briefs;

		try {
			const embeddingDocs = await loadEmbeddingDocs(statementIds);
			for (const id of statementIds) {
				const brief =
					embeddingDocs.get(id)?.embeddingBrief ??
					(isLegacyEmbeddingFallbackEnabled()
						? legacyStatements.get(id)?.embeddingBrief
						: undefined);
				if (typeof brief === 'string' && brief !== '') briefs.set(id, brief);
			}
		} catch (error) {
			logger.error('Failed to get embedding briefs', { error });
		}

		return briefs;
	}

	/**
	 * Save a statement's embedding.
	 * @param statementId - The statement ID
	 * @param embedding - The 1536-dimensional embedding vector
	 * @param context - Optional context used for embedding (e.g., parent question)
	 * @param text - Optional statement text; when provided, its sha1 hash is
	 *   written as `textHash` so the synthesis verdict cache can detect
	 *   text edits and invalidate cached pair verdicts automatically.
	 */
	async saveEmbedding(
		statementId: string,
		embedding: number[],
		context?: string,
		text?: string,
		brief?: string,
		model: string = DEFAULT_EMBEDDING_MODEL,
	): Promise<void> {
		if (embedding.length !== EMBEDDING_DIMENSIONS) {
			logger.warn(
				`Invalid embedding dimensions: ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`,
			);
		}

		try {
			const statementRef = this.db.collection(this.statementsCollection).doc(statementId);
			const statementSnap = await statementRef.get();
			const statement = statementSnap.data();
			if (!statementSnap.exists || !statement) {
				throw new Error(`Statement ${statementId} not found`);
			}

			const payload: Record<string, unknown> = {
				// Anything still on the statement doc moves along with this write
				// (the hybrid vector, an older brief); the new values override.
				...legacyFieldsForEmbeddingDoc(statement),
				statementId,
				parentId: statement.parentId ?? '',
				embedding: FieldValue.vector(embedding),
				embeddingModel: model,
				embeddingContext: context || null,
				embeddingCreatedAt: Date.now(),
				lastUpdate: Date.now(),
			};
			if (text) {
				payload.textHash = computeTextHash(text);
			}
			if (brief) {
				payload.embeddingBrief = brief;
			}

			const batch = this.db.batch();
			batch.set(embeddingDocRef(statementId), payload, { merge: true });
			if (hasLegacyEmbeddingFields(statement)) {
				batch.update(statementRef, legacyFieldDeletes());
			}
			await batch.commit();

			logger.info(`Saved embedding for statement ${statementId}`);
		} catch (error) {
			logger.error('Failed to save embedding', { statementId, error });
			throw error;
		}
	}

	/**
	 * Save embeddings for multiple statements in batch
	 * @param embeddings - Array of {statementId, embedding, context, text}
	 *   When `text` is provided, its sha1 hash is written as `textHash` so
	 *   the verdict cache auto-invalidates on text edits.
	 */
	async saveBatchEmbeddings(
		embeddings: Array<{
			statementId: string;
			embedding: number[];
			context?: string;
			text?: string;
		}>,
		model: string = DEFAULT_EMBEDDING_MODEL,
	): Promise<{ success: number; failed: number }> {
		if (embeddings.length === 0) {
			return { success: 0, failed: 0 };
		}

		let success = 0;
		let failed = 0;

		// Two writes per statement (embedding doc + legacy strip) under the
		// 500-operation batch limit.
		const batchSize = 200;

		for (let i = 0; i < embeddings.length; i += batchSize) {
			const currentBatch = embeddings.slice(i, i + batchSize);
			const statementRefs = currentBatch.map((item) =>
				this.db.collection(this.statementsCollection).doc(item.statementId),
			);
			const statementSnaps = await this.db.getAll(...statementRefs);
			const batch = this.db.batch();
			let queued = 0;

			currentBatch.forEach((item, index) => {
				const statement = statementSnaps[index]?.data();
				if (!statementSnaps[index]?.exists || !statement) {
					logger.warn(`Statement not found for embedding: ${item.statementId}`);
					failed++;

					return;
				}

				const payload: Record<string, unknown> = {
					...legacyFieldsForEmbeddingDoc(statement),
					statementId: item.statementId,
					parentId: statement.parentId ?? '',
					embedding: FieldValue.vector(item.embedding),
					embeddingModel: model,
					embeddingContext: item.context || null,
					embeddingCreatedAt: Date.now(),
					lastUpdate: Date.now(),
				};
				if (item.text) {
					payload.textHash = computeTextHash(item.text);
				}

				batch.set(embeddingDocRef(item.statementId), payload, { merge: true });
				if (hasLegacyEmbeddingFields(statement)) {
					batch.update(statementRefs[index], legacyFieldDeletes());
				}
				queued++;
			});

			try {
				await batch.commit();
				success += queued;
			} catch (error) {
				logger.error('Batch commit failed', { error });
				failed += queued;
			}
		}

		logger.info(`Batch save complete: ${success} success, ${failed} failed`);

		return { success, failed };
	}

	/**
	 * Check if a statement has an embedding
	 * @param statementId - The statement ID
	 * @returns true if embedding exists
	 */
	async hasEmbedding(statementId: string): Promise<boolean> {
		try {
			const embeddingSnap = await embeddingDocRef(statementId).get();
			if (embeddingSnap.exists && embeddingSnap.data()?.embedding) return true;
			if (!isLegacyEmbeddingFallbackEnabled()) return false;

			const doc = await this.db.collection(this.statementsCollection).doc(statementId).get();

			return Boolean(doc.exists && doc.data()?.embedding);
		} catch (error) {
			logger.error('Failed to check embedding existence', {
				statementId,
				error,
			});

			return false;
		}
	}

	/**
	 * Get all statements with embeddings under a parent
	 * @param parentId - The parent statement ID
	 * @returns Array of {statementId, embedding, statement}
	 */
	async getEmbeddingsForParent(parentId: string): Promise<EmbeddingWithStatement[]> {
		try {
			// Query all statements (don't filter by hide - it may not exist on all docs)
			const [statementsSnap, embeddingsSnap] = await Promise.all([
				this.db.collection(this.statementsCollection).where('parentId', '==', parentId).get(),
				embeddingsCollection().where('parentId', '==', parentId).get(),
			]);
			const embeddingDocs = new Map(embeddingsSnap.docs.map((doc) => [doc.id, doc.data()]));

			const results: EmbeddingWithStatement[] = [];
			// This path fed in-memory similarity WITHOUT the model guard the other
			// readers have — a gap found while making the model per-question.
			const expectedModel = await resolveEmbeddingModel(parentId);
			let incompatible = 0;

			statementsSnap.docs.forEach((doc) => {
				const data = doc.data();
				// Skip hidden statements
				if (data?.hide === true) {
					return;
				}
				const stored = embeddingDocs.get(doc.id);
				const source = stored?.embedding || !isLegacyEmbeddingFallbackEnabled() ? stored : data;
				if (!isCompatibleModel(source?.embeddingModel, expectedModel)) {
					incompatible++;

					return;
				}
				const embedding = extractEmbeddingArray(source?.embedding);
				if (embedding) {
					results.push({
						statementId: doc.id,
						embedding,
						statement: data.statement || '',
					});
				}
			});
			if (incompatible > 0) {
				logger.info('embeddingCache: ignored vectors from a different model', {
					parentId,
					count: incompatible,
					expectedModel,
				});
			}

			logger.info(`Found ${results.length} statements with embeddings under parent ${parentId}`);

			return results;
		} catch (error) {
			logger.error('Failed to get embeddings for parent', { parentId, error });

			return [];
		}
	}

	/**
	 * Get embedding coverage statistics for a parent statement
	 * @param parentId - The parent statement ID
	 * @returns Statistics about embedding coverage
	 */
	async getEmbeddingCoverage(parentId: string): Promise<{
		totalStatements: number;
		withEmbeddings: number;
		withoutEmbeddings: number;
		coveragePercent: number;
	}> {
		try {
			// Query all statements under parent (don't filter by hide - it may not exist).
			// Only presence matters here, so the embedding docs come back without
			// their vectors (`embeddingCreatedAt` is written and deleted with them).
			const [statementsSnap, embeddedSnap] = await Promise.all([
				this.db.collection(this.statementsCollection).where('parentId', '==', parentId).get(),
				embeddingsCollection().where('parentId', '==', parentId).select('embeddingCreatedAt').get(),
			]);
			const embeddedIds = new Set(
				embeddedSnap.docs
					.filter((doc) => doc.data().embeddingCreatedAt !== undefined)
					.map((doc) => doc.id),
			);
			const fallback = isLegacyEmbeddingFallbackEnabled();

			let withEmbeddings = 0;
			let withoutEmbeddings = 0;
			let totalStatements = 0;

			statementsSnap.docs.forEach((doc) => {
				const data = doc.data();
				// Skip hidden statements
				if (data?.hide === true) {
					return;
				}
				totalStatements++;
				if (embeddedIds.has(doc.id) || (fallback && data?.embedding)) {
					withEmbeddings++;
				} else {
					withoutEmbeddings++;
				}
			});
			const coveragePercent =
				totalStatements > 0 ? Math.round((withEmbeddings / totalStatements) * 100) : 0;

			return {
				totalStatements,
				withEmbeddings,
				withoutEmbeddings,
				coveragePercent,
			};
		} catch (error) {
			logger.error('Failed to get embedding coverage', { parentId, error });

			return {
				totalStatements: 0,
				withEmbeddings: 0,
				withoutEmbeddings: 0,
				coveragePercent: 0,
			};
		}
	}

	/**
	 * Delete embedding from a statement (for regeneration)
	 * @param statementId - The statement ID
	 */
	async deleteEmbedding(statementId: string): Promise<void> {
		const deletes = {
			embedding: FieldValue.delete(),
			embeddingModel: FieldValue.delete(),
			embeddingContext: FieldValue.delete(),
			embeddingCreatedAt: FieldValue.delete(),
		};

		try {
			try {
				await embeddingDocRef(statementId).update({ ...deletes, lastUpdate: Date.now() });
			} catch (error) {
				if (!isNotFoundError(error)) throw error;
			}

			if (isLegacyEmbeddingFallbackEnabled()) {
				const statementRef = this.db.collection(this.statementsCollection).doc(statementId);
				const statementSnap = await statementRef.get();
				if (statementSnap.data()?.embedding) {
					await statementRef.update(deletes);
				}
			}

			logger.info(`Deleted embedding for statement ${statementId}`);
		} catch (error) {
			logger.error('Failed to delete embedding', { statementId, error });
			throw error;
		}
	}
}

// Export singleton instance
export const embeddingCache = new EmbeddingCacheService();

// Also export class for testing
export { EmbeddingCacheService };
