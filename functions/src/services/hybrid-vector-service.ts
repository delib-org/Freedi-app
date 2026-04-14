import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Statement, StatementEvaluation } from '@freedi/shared-types';
import { EMBEDDING_DIMENSIONS } from './embedding-service';

// Hybrid vector configuration
const RATING_VECTOR_DIMENSIONS = 8;
export const HYBRID_DIMENSIONS = EMBEDDING_DIMENSIONS + RATING_VECTOR_DIMENSIONS; // 1544

// Alpha decay parameter: controls how fast rating weight grows with evaluators
const ALPHA_BETA = 0.3;

/**
 * Compute alpha (text vs. rating blend weight) based on evaluator count.
 *
 * alpha = 1 / (1 + beta * log2(1 + n))
 *
 * 0 evaluators → 1.0 (pure text)
 * 5 evaluators → ~0.77
 * 20 evaluators → ~0.57
 * 100 evaluators → ~0.40
 */
export function computeAlpha(numberOfEvaluators: number): number {
	if (numberOfEvaluators <= 0) return 1.0;

	return 1.0 / (1.0 + ALPHA_BETA * Math.log2(1 + numberOfEvaluators));
}

/**
 * Build an 8-dimensional rating vector from a statement's evaluation statistics.
 * All values are normalized to roughly [0, 1] or [-1, 1] range.
 *
 * @param evaluation - The statement's aggregated evaluation metrics
 * @param maxEvaluatorsInParent - The max evaluator count among all sibling options (for normalization)
 * @returns 8-dimensional rating vector
 */
export function computeRatingVector(
	evaluation: StatementEvaluation | undefined,
	maxEvaluatorsInParent: number,
): number[] {
	if (!evaluation || evaluation.numberOfEvaluators === 0) {
		return new Array(RATING_VECTOR_DIMENSIONS).fill(0);
	}

	const n = evaluation.numberOfEvaluators;
	const nPro = evaluation.numberOfProEvaluators ?? 0;
	const sPro = evaluation.sumPro ?? 0;
	const sCon = Math.abs(evaluation.sumCon ?? 0);
	const likeMindedness = evaluation.likeMindedness ?? 0;
	const maxEval = Math.max(maxEvaluatorsInParent, 1);

	return [
		evaluation.averageEvaluation ?? 0,                    // dim 0: mean sentiment [-1, 1]
		evaluation.agreement ?? 0,                            // dim 1: WizCol consensus [-1, 1]
		evaluation.agreementIndex ?? 0,                       // dim 2: confidence-adjusted [0, 1]
		likeMindedness,                                       // dim 3: opinion similarity [0, 1]
		n > 0 ? nPro / n : 0,                                // dim 4: pro ratio [0, 1]
		maxEval > 0 ? n / maxEval : 0,                       // dim 5: evaluator density [0, 1]
		1 - likeMindedness,                                   // dim 6: polarization [0, 1]
		n > 0 ? (sPro + sCon) / n : 0,                       // dim 7: intensity [0, 1]
	];
}

/**
 * Combine a 1536-dim text embedding with an 8-dim rating vector into a 1544-dim hybrid vector.
 *
 * The alpha parameter controls relative weight:
 * - Text component scaled by alpha * sqrt(textDim / totalDim)
 * - Rating component scaled by (1 - alpha) * sqrt(ratingDim / totalDim)
 *
 * This ensures each component contributes its intended weight to cosine similarity
 * regardless of dimensionality.
 */
export function computeHybridVector(
	textEmbedding: number[],
	ratingVector: number[],
	numberOfEvaluators: number,
): number[] {
	if (textEmbedding.length !== EMBEDDING_DIMENSIONS) {
		throw new Error(
			`Text embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${textEmbedding.length}`,
		);
	}
	if (ratingVector.length !== RATING_VECTOR_DIMENSIONS) {
		throw new Error(
			`Rating vector dimension mismatch: expected ${RATING_VECTOR_DIMENSIONS}, got ${ratingVector.length}`,
		);
	}

	const alpha = computeAlpha(numberOfEvaluators);
	const textScale = alpha * Math.sqrt(EMBEDDING_DIMENSIONS / HYBRID_DIMENSIONS);
	const ratingScale = (1 - alpha) * Math.sqrt(RATING_VECTOR_DIMENSIONS / HYBRID_DIMENSIONS);

	const hybrid = new Array(HYBRID_DIMENSIONS);

	// Text component (first 1536 dims)
	for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
		hybrid[i] = textEmbedding[i] * textScale;
	}

	// Rating component (last 8 dims)
	for (let i = 0; i < RATING_VECTOR_DIMENSIONS; i++) {
		hybrid[EMBEDDING_DIMENSIONS + i] = ratingVector[i] * ratingScale;
	}

	return hybrid;
}

/**
 * Check if hybrid clustering is enabled for a statement, using setting inheritance.
 *
 * Priority:
 * 1. Explicit opt-out on this statement → false
 * 2. Explicit opt-in on this statement → true
 * 3. Inherit from top parent → whatever top parent says
 * 4. Default → false
 */
export function isHybridClusteringEnabled(
	statement: Statement,
	topParent?: Statement,
): boolean {
	// Explicit opt-out on this statement takes priority
	if (statement.statementSettings?.enableHybridClustering === false) return false;

	// Explicit opt-in on this statement
	if (statement.statementSettings?.enableHybridClustering === true) return true;

	// Inherit from top parent
	return topParent?.statementSettings?.enableHybridClustering === true;
}

/**
 * Save a hybrid embedding vector to a statement document.
 */
export async function saveHybridEmbedding(
	statementId: string,
	hybridVector: number[],
): Promise<void> {
	const db = getFirestore();

	if (hybridVector.length !== HYBRID_DIMENSIONS) {
		logger.warn(
			`Invalid hybrid embedding dimensions: ${hybridVector.length}, expected ${HYBRID_DIMENSIONS}`,
		);
	}

	try {
		await db.collection('statements').doc(statementId).update({
			hybridEmbedding: FieldValue.vector(hybridVector),
			hybridEmbeddingStale: false,
			hybridEmbeddingUpdatedAt: Date.now(),
		});
	} catch (error) {
		logger.error('Failed to save hybrid embedding', { statementId, error });
		throw error;
	}
}

/**
 * Mark a statement's hybrid embedding as stale (needs recomputation).
 * This is a cheap single-field write, called from evaluation triggers.
 */
export async function markHybridEmbeddingStale(statementId: string): Promise<void> {
	const db = getFirestore();

	try {
		await db.collection('statements').doc(statementId).update({
			hybridEmbeddingStale: true,
		});
	} catch (error) {
		logger.error('Failed to mark hybrid embedding stale', { statementId, error });
		throw error;
	}
}

// Helper to extract embedding array from VectorValue or plain array
export function extractEmbeddingArray(embedding: unknown): number[] | null {
	if (!embedding) return null;

	if (Array.isArray(embedding)) {
		return embedding as number[];
	}

	if (typeof embedding === 'object' && embedding !== null && 'toArray' in embedding) {
		const vectorValue = embedding as { toArray: () => number[] };

		return vectorValue.toArray();
	}

	return null;
}
