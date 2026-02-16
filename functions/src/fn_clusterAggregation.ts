import { Collections, Evaluation, Statement } from '@freedi/shared-types';
import {
	Framing,
	ClusterAggregatedEvaluation,
	CLUSTER_AGGREGATION_CACHE,
	getClusterAggregationId,
	isClusterAggregationValid,
} from '@freedi/shared-types';

// New collection names (not yet in delib-npm)
const FRAMING_COLLECTIONS = {
	framings: 'framings',
	framingRequests: 'framingRequests',
	clusterAggregations: 'clusterAggregations',
	framingSnapshots: 'framingSnapshots',
} as const;

// Extended Statement type with framing-specific fields
interface StatementWithFraming extends Statement {
	framingId?: string;
	framingClusters?: Record<string, string>;
}
import { Response, Request, logger } from 'firebase-functions/v1';
import { onDocumentWritten, Change, FirestoreEvent } from 'firebase-functions/v2/firestore';
import { firestore as FirebaseFirestore } from 'firebase-admin';
import { db } from '.';

/**
 * Core deduplication algorithm for cluster aggregation
 *
 * When a user evaluates multiple options within the same cluster:
 * 1. Count them ONCE (not multiple times)
 * 2. Use the AVERAGE of their evaluations as their cluster-level score
 *
 * Example:
 * - User A evaluates Option 1 with +1 and Option 2 with +0.5
 * - User A's cluster-level score = (+1 + +0.5) / 2 = +0.75
 * - User A is counted as 1 unique evaluator (not 2)
 */
async function calculateClusterAggregation(
	clusterId: string,
	framingId: string,
	parentStatementId: string,
): Promise<ClusterAggregatedEvaluation> {
	// 1. Get the framing to understand cluster structure
	const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

	if (!framingDoc.exists) {
		throw new Error(`Framing ${framingId} not found`);
	}

	// 2. Get all options in this cluster
	// Options are linked via framingClusters map or direct parentId
	const optionsSnapshot = await db
		.collection(Collections.statements)
		.where(`framingClusters.${framingId}`, '==', clusterId)
		.get();

	// Also check direct parent relationship for legacy clusters
	const directChildrenSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', clusterId)
		.where('isCluster', '!=', true)
		.get();

	// Combine and deduplicate option IDs
	const optionIds = new Set<string>();
	optionsSnapshot.docs.forEach((doc) => optionIds.add(doc.id));
	directChildrenSnapshot.docs.forEach((doc) => optionIds.add(doc.id));

	const optionIdsArray = Array.from(optionIds);

	if (optionIdsArray.length === 0) {
		// No options in cluster
		return createEmptyAggregation(clusterId, framingId, parentStatementId);
	}

	// 3. Fetch all evaluations for these options
	// Firestore 'in' query is limited to 30 items, so we may need to batch
	const allEvaluations: Evaluation[] = [];

	const batchSize = 30;
	for (let i = 0; i < optionIdsArray.length; i += batchSize) {
		const batch = optionIdsArray.slice(i, i + batchSize);
		const evaluationsSnapshot = await db
			.collection(Collections.evaluations)
			.where('statementId', 'in', batch)
			.get();

		evaluationsSnapshot.docs.forEach((doc) => {
			allEvaluations.push(doc.data() as Evaluation);
		});
	}

	// 4. Group evaluations by user (evaluatorId)
	const evaluationsByUser = new Map<string, { evaluations: number[]; userId: string }>();

	allEvaluations.forEach((evaluation) => {
		const userId = evaluation.evaluatorId;
		if (!userId) return;

		const existing = evaluationsByUser.get(userId);
		if (existing) {
			existing.evaluations.push(evaluation.evaluation);
		} else {
			evaluationsByUser.set(userId, {
				userId,
				evaluations: [evaluation.evaluation],
			});
		}
	});

	// 5. Calculate per-user AVERAGE and aggregate
	let totalScore = 0;
	let proCount = 0;
	let conCount = 0;
	let neutralCount = 0;
	let sumPro = 0;
	let sumCon = 0;

	evaluationsByUser.forEach((userData) => {
		// Calculate user's average evaluation within this cluster
		const userAverage =
			userData.evaluations.reduce((sum, val) => sum + val, 0) / userData.evaluations.length;

		totalScore += userAverage;

		// Classify based on user's average
		if (userAverage > 0) {
			proCount++;
			sumPro += userAverage;
		} else if (userAverage < 0) {
			conCount++;
			sumCon += Math.abs(userAverage);
		} else {
			neutralCount++;
		}
	});

	const uniqueEvaluatorCount = evaluationsByUser.size;
	const averageClusterConsensus = uniqueEvaluatorCount > 0 ? totalScore / uniqueEvaluatorCount : 0;

	// 6. Calculate evaluations per option for distribution analysis
	const evaluationsPerOption: number[] = [];
	for (const optionId of optionIdsArray) {
		const count = allEvaluations.filter((e) => e.statementId === optionId).length;
		evaluationsPerOption.push(count);
	}

	// 7. Create aggregation result
	const now = Date.now();
	const aggregation: ClusterAggregatedEvaluation = {
		clusterId,
		framingId,
		parentStatementId,
		uniqueEvaluatorCount,
		averageClusterConsensus,
		proEvaluatorCount: proCount,
		conEvaluatorCount: conCount,
		neutralEvaluatorCount: neutralCount,
		sumPro,
		sumCon,
		optionCount: optionIdsArray.length,
		evaluationsPerOption,
		calculatedAt: now,
		expiresAt: now + CLUSTER_AGGREGATION_CACHE.DEFAULT_TTL_MS,
		isStale: false,
	};

	// 8. Save to cache
	const aggregationId = getClusterAggregationId(clusterId, framingId);
	await db.collection(FRAMING_COLLECTIONS.clusterAggregations).doc(aggregationId).set(aggregation);

	logger.info(
		`Calculated cluster aggregation for ${clusterId}: ${uniqueEvaluatorCount} unique evaluators, consensus: ${averageClusterConsensus.toFixed(2)}`,
	);

	return aggregation;
}

function createEmptyAggregation(
	clusterId: string,
	framingId: string,
	parentStatementId: string,
): ClusterAggregatedEvaluation {
	const now = Date.now();

	return {
		clusterId,
		framingId,
		parentStatementId,
		uniqueEvaluatorCount: 0,
		averageClusterConsensus: 0,
		proEvaluatorCount: 0,
		conEvaluatorCount: 0,
		neutralEvaluatorCount: 0,
		sumPro: 0,
		sumCon: 0,
		optionCount: 0,
		evaluationsPerOption: [],
		calculatedAt: now,
		expiresAt: now + CLUSTER_AGGREGATION_CACHE.DEFAULT_TTL_MS,
		isStale: false,
	};
}

/**
 * Get aggregated evaluations for all clusters in a framing
 * Uses cache when available, recalculates when stale
 */
export async function getClusterAggregations(req: Request, res: Response): Promise<void> {
	try {
		const { framingId, forceRefresh } = req.query;

		if (!framingId || typeof framingId !== 'string') {
			res.status(400).send({ error: 'Invalid input: framingId is required', ok: false });

			return;
		}

		// Get framing
		const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

		if (!framingDoc.exists) {
			res.status(404).send({ error: 'Framing not found', ok: false });

			return;
		}

		const framing = framingDoc.data() as Framing;
		const aggregations: ClusterAggregatedEvaluation[] = [];

		for (const clusterId of framing.clusterIds) {
			const aggregationId = getClusterAggregationId(clusterId, framingId);

			// Check cache unless force refresh
			if (forceRefresh !== 'true') {
				const cachedDoc = await db
					.collection(FRAMING_COLLECTIONS.clusterAggregations)
					.doc(aggregationId)
					.get();

				if (cachedDoc.exists) {
					const cached = cachedDoc.data() as ClusterAggregatedEvaluation;

					if (isClusterAggregationValid(cached)) {
						aggregations.push(cached);
						continue;
					}
				}
			}

			// Calculate fresh aggregation
			const aggregation = await calculateClusterAggregation(
				clusterId,
				framingId,
				framing.parentStatementId,
			);
			aggregations.push(aggregation);
		}

		// Calculate total unique evaluators across ALL clusters (with deduplication)
		const totalUniqueEvaluators = await calculateTotalUniqueEvaluators(
			framing.clusterIds,
			framingId,
		);

		res.status(200).send({
			framingId,
			aggregations,
			totalUniqueEvaluators,
			ok: true,
		});
	} catch (error) {
		logger.error('Error getting cluster aggregations:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

/**
 * Calculate total unique evaluators across all clusters in a framing
 * This also deduplicates: a user who evaluated options in multiple clusters
 * is still counted only once at the framing level
 */
async function calculateTotalUniqueEvaluators(
	clusterIds: string[],
	framingId: string,
): Promise<number> {
	const allEvaluatorIds = new Set<string>();

	for (const clusterId of clusterIds) {
		// Get options in this cluster
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where(`framingClusters.${framingId}`, '==', clusterId)
			.get();

		const directChildrenSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', clusterId)
			.where('isCluster', '!=', true)
			.get();

		const optionIds = new Set<string>();
		optionsSnapshot.docs.forEach((doc) => optionIds.add(doc.id));
		directChildrenSnapshot.docs.forEach((doc) => optionIds.add(doc.id));

		const optionIdsArray = Array.from(optionIds);

		// Fetch evaluations for these options
		const batchSize = 30;
		for (let i = 0; i < optionIdsArray.length; i += batchSize) {
			const batch = optionIdsArray.slice(i, i + batchSize);
			if (batch.length === 0) continue;

			const evaluationsSnapshot = await db
				.collection(Collections.evaluations)
				.where('statementId', 'in', batch)
				.get();

			evaluationsSnapshot.docs.forEach((doc) => {
				const evaluation = doc.data() as Evaluation;
				if (evaluation.evaluatorId) {
					allEvaluatorIds.add(evaluation.evaluatorId);
				}
			});
		}
	}

	return allEvaluatorIds.size;
}

/**
 * Recalculate aggregation for a specific cluster
 */
export async function recalculateClusterAggregation(req: Request, res: Response): Promise<void> {
	try {
		const { clusterId, framingId } = req.body;

		if (!clusterId || typeof clusterId !== 'string') {
			res.status(400).send({ error: 'Invalid input: clusterId is required', ok: false });

			return;
		}

		if (!framingId || typeof framingId !== 'string') {
			res.status(400).send({ error: 'Invalid input: framingId is required', ok: false });

			return;
		}

		// Get framing to get parentStatementId
		const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

		if (!framingDoc.exists) {
			res.status(404).send({ error: 'Framing not found', ok: false });

			return;
		}

		const framing = framingDoc.data() as Framing;

		const aggregation = await calculateClusterAggregation(
			clusterId,
			framingId,
			framing.parentStatementId,
		);

		res.status(200).send({
			aggregation,
			ok: true,
		});
	} catch (error) {
		logger.error('Error recalculating cluster aggregation:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

/**
 * Firestore trigger: Invalidate cache when evaluation changes
 */
export const onEvaluationChangeInvalidateCache = onDocumentWritten(
	`${Collections.evaluations}/{evaluationId}`,
	async (event: FirestoreEvent<Change<FirebaseFirestore.DocumentSnapshot> | undefined>) => {
		try {
			const change = event.data;
			if (!change) return;

			// Get the statementId from either before or after data
			const afterData = change.after?.data() as Evaluation | undefined;
			const beforeData = change.before?.data() as Evaluation | undefined;

			const statementId = afterData?.statementId || beforeData?.statementId;

			if (!statementId) {
				logger.warn('No statementId found in evaluation change');

				return;
			}

			// Find which framings/clusters contain this statement
			const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

			if (!statementDoc.exists) {
				return;
			}

			const statement = statementDoc.data() as StatementWithFraming;

			// Check framingClusters map on the statement
			const framingClusters = statement.framingClusters;

			if (framingClusters && typeof framingClusters === 'object') {
				// Mark all relevant cluster aggregations as stale
				const batch = db.batch();

				for (const [framingId, clusterId] of Object.entries(framingClusters)) {
					const aggregationId = getClusterAggregationId(clusterId as string, framingId);
					const aggregationRef = db
						.collection(FRAMING_COLLECTIONS.clusterAggregations)
						.doc(aggregationId);

					batch.update(aggregationRef, { isStale: true });
				}

				await batch.commit();

				logger.info(
					`Marked ${Object.keys(framingClusters).length} cluster aggregations as stale due to evaluation change on statement ${statementId}`,
				);
			}

			// Also check if parent is a cluster
			if (statement.parentId) {
				const parentDoc = await db.collection(Collections.statements).doc(statement.parentId).get();

				if (parentDoc.exists) {
					const parent = parentDoc.data() as StatementWithFraming;

					if (parent.isCluster && parent.framingId) {
						const aggregationId = getClusterAggregationId(statement.parentId, parent.framingId);

						await db
							.collection(FRAMING_COLLECTIONS.clusterAggregations)
							.doc(aggregationId)
							.update({ isStale: true })
							.catch(() => {
								// Aggregation may not exist yet, that's fine
							});

						logger.info(
							`Marked cluster aggregation ${aggregationId} as stale due to evaluation change`,
						);
					}
				}
			}
		} catch (error) {
			logger.error('Error in onEvaluationChangeInvalidateCache:', error);
		}
	},
);

/**
 * Get aggregation summary for a framing (overview without full details)
 */
export async function getFramingAggregationSummary(req: Request, res: Response): Promise<void> {
	try {
		const { framingId } = req.query;

		if (!framingId || typeof framingId !== 'string') {
			res.status(400).send({ error: 'Invalid input: framingId is required', ok: false });

			return;
		}

		// Get framing
		const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

		if (!framingDoc.exists) {
			res.status(404).send({ error: 'Framing not found', ok: false });

			return;
		}

		const framing = framingDoc.data() as Framing;

		// Get cached aggregations
		const aggregationsSnapshot = await db
			.collection(FRAMING_COLLECTIONS.clusterAggregations)
			.where('framingId', '==', framingId)
			.get();

		const aggregations = aggregationsSnapshot.docs.map(
			(doc) => doc.data() as ClusterAggregatedEvaluation,
		);

		// Calculate summary stats
		const totalUniqueEvaluators = await calculateTotalUniqueEvaluators(
			framing.clusterIds,
			framingId,
		);

		const averageConsensus =
			aggregations.length > 0
				? aggregations.reduce((sum, a) => sum + a.averageClusterConsensus, 0) / aggregations.length
				: 0;

		const totalOptions = aggregations.reduce((sum, a) => sum + a.optionCount, 0);

		const hasStaleData = aggregations.some((a) => a.isStale);

		res.status(200).send({
			framingId,
			framingName: framing.name,
			clusterCount: framing.clusterIds.length,
			totalUniqueEvaluators,
			averageConsensus,
			totalOptions,
			hasStaleData,
			ok: true,
		});
	} catch (error) {
		logger.error('Error getting framing aggregation summary:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}
