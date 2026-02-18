import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from './index';
import { Collections, Evaluation, StatementEvaluation, functionConfig } from '@freedi/shared-types';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';

// Uncertainty floor for Mean - SEM calculation
const FLOOR_STD_DEV = 0.5;

interface FixClusterRequest {
	clusterId: string;
	sourceIds: string[];
	dryRun?: boolean;
}

interface FixClusterResult {
	success: boolean;
	dryRun: boolean;
	clusterId: string;
	sourceCount: number;
	before: {
		consensus: number;
		evaluators: number;
		pro: number;
		con: number;
	};
	after: {
		consensus: number;
		evaluators: number;
		pro: number;
		con: number;
	};
	sourceDetails: Array<{
		id: string;
		statement: string;
		evaluators: number;
		consensus: number;
	}>;
}

/**
 * Calculate agreement using Mean - SEM with uncertainty floor
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	let sem = FLOOR_STD_DEV;

	if (numberOfEvaluators > 1) {
		const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
		const observedStdDev = Math.sqrt(Math.max(0, variance));
		const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
		sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);
	}

	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);

	return mean - penalty;
}

/**
 * Fix cluster integration by setting proper fields and recalculating evaluations.
 *
 * This function:
 * 1. Sets isCluster: true and integratedOptions on the cluster
 * 2. Sets integratedInto on source statements
 * 3. Recalculates cluster evaluations from sources
 * 4. Direct evaluations on cluster (without migratedAt) take priority
 */
export const fixClusterIntegration = onCall<FixClusterRequest>(
	{ region: functionConfig.region },
	async (request): Promise<FixClusterResult> => {
		const { clusterId, sourceIds, dryRun = false } = request.data;

		if (!clusterId) {
			throw new HttpsError('invalid-argument', 'clusterId is required');
		}

		if (!sourceIds || sourceIds.length === 0) {
			throw new HttpsError('invalid-argument', 'sourceIds array is required');
		}

		// Check authentication
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const modeLabel = dryRun ? '[DRY RUN] ' : '';
		logger.info(`${modeLabel}Fixing cluster ${clusterId} with ${sourceIds.length} sources`);

		// 1. Get cluster statement
		const clusterRef = db.collection(Collections.statements).doc(clusterId);
		const clusterDoc = await clusterRef.get();

		if (!clusterDoc.exists) {
			throw new HttpsError('not-found', 'Cluster statement not found');
		}

		const cluster = clusterDoc.data()!;
		const before = {
			consensus: cluster.consensus || 0,
			evaluators: cluster.evaluation?.numberOfEvaluators || 0,
			pro: cluster.evaluation?.numberOfProEvaluators || 0,
			con: cluster.evaluation?.numberOfConEvaluators || 0,
		};

		// 2. Get source statements
		const sourceDetails: FixClusterResult['sourceDetails'] = [];
		for (const sourceId of sourceIds) {
			const sourceDoc = await db.collection(Collections.statements).doc(sourceId).get();
			if (sourceDoc.exists) {
				const source = sourceDoc.data()!;
				sourceDetails.push({
					id: sourceId,
					statement: source.statement?.substring(0, 50) || '',
					evaluators: source.evaluation?.numberOfEvaluators || 0,
					consensus: source.consensus || 0,
				});
			}
		}

		// 3. Collect evaluations from sources
		const userEvaluations = new Map<
			string,
			{
				evaluation: number;
				isDirect: boolean;
				sourceEvaluations: number[];
			}
		>();

		for (const sourceId of sourceIds) {
			const sourceEvals = await db
				.collection(Collections.evaluations)
				.where('statementId', '==', sourceId)
				.get();

			for (const doc of sourceEvals.docs) {
				const evaluation = doc.data() as Evaluation;
				const userId = evaluation.evaluator?.uid;
				if (!userId) continue;

				const existing = userEvaluations.get(userId);
				if (existing && !existing.isDirect) {
					// Average multiple source evaluations from the same user
					existing.sourceEvaluations.push(evaluation.evaluation);
					existing.evaluation =
						existing.sourceEvaluations.reduce((a, b) => a + b, 0) /
						existing.sourceEvaluations.length;
				} else if (!existing) {
					userEvaluations.set(userId, {
						evaluation: evaluation.evaluation,
						isDirect: false,
						sourceEvaluations: [evaluation.evaluation],
					});
				}
			}
		}

		logger.info(`${modeLabel}Found ${userEvaluations.size} unique users from sources`);

		// 4. Collect DIRECT evaluations on cluster (without migratedAt) - these OVERWRITE
		const clusterEvals = await db
			.collection(Collections.evaluations)
			.where('statementId', '==', clusterId)
			.get();

		let directCount = 0;
		for (const doc of clusterEvals.docs) {
			const evaluation = doc.data() as Evaluation & { migratedAt?: number };
			if (evaluation.migratedAt) continue; // Skip migrated evaluations

			const userId = evaluation.evaluator?.uid;
			if (!userId) continue;

			directCount++;
			// Direct evaluation OVERWRITES any source evaluation
			userEvaluations.set(userId, {
				evaluation: evaluation.evaluation,
				isDirect: true,
				sourceEvaluations: [],
			});
		}

		logger.info(`${modeLabel}Found ${directCount} direct evaluations on cluster`);

		// 5. Calculate metrics from merged evaluations
		let sumEvaluations = 0;
		let sumSquaredEvaluations = 0;
		let sumPro = 0;
		let sumCon = 0;
		let proCount = 0;
		let conCount = 0;

		for (const [, data] of userEvaluations) {
			const evalValue = data.evaluation;
			sumEvaluations += evalValue;
			sumSquaredEvaluations += evalValue * evalValue;

			if (evalValue > 0) {
				proCount++;
				sumPro += evalValue;
			} else if (evalValue < 0) {
				conCount++;
				sumCon += Math.abs(evalValue);
			}
		}

		const totalEvaluators = proCount + conCount;
		const averageEvaluation = totalEvaluators > 0 ? sumEvaluations / totalEvaluators : 0;
		const agreement = calcAgreement(sumEvaluations, sumSquaredEvaluations, totalEvaluators);
		const consensusValid = calculateConsensusValid(
			agreement,
			cluster.popperHebbianScore ?? undefined,
		);

		const after = {
			consensus: agreement,
			evaluators: totalEvaluators,
			pro: proCount,
			con: conCount,
		};

		logger.info(
			`${modeLabel}Calculated: consensus ${agreement.toFixed(3)}, ${totalEvaluators} evaluators (${proCount} pro, ${conCount} con)`,
		);

		// 6. Apply changes (unless dry run)
		if (!dryRun) {
			const now = Date.now();
			const batch = db.batch();

			// Update cluster with proper fields
			const updatedEvaluation: StatementEvaluation = {
				...(cluster.evaluation || {}),
				numberOfEvaluators: totalEvaluators,
				numberOfProEvaluators: proCount,
				numberOfConEvaluators: conCount,
				sumEvaluations,
				sumSquaredEvaluations,
				sumPro,
				sumCon,
				averageEvaluation,
				agreement,
				evaluationRandomNumber: cluster.evaluation?.evaluationRandomNumber ?? Math.random(),
				viewed: cluster.evaluation?.viewed ?? 0,
			};

			batch.update(clusterRef, {
				isCluster: true,
				integratedOptions: sourceIds,
				evaluation: updatedEvaluation,
				totalEvaluators,
				consensus: agreement,
				consensusValid,
				lastUpdate: now,
			});

			// Update source statements with integratedInto
			for (const sourceId of sourceIds) {
				const sourceRef = db.collection(Collections.statements).doc(sourceId);
				batch.update(sourceRef, {
					integratedInto: clusterId,
					lastUpdate: now,
				});
			}

			await batch.commit();
			logger.info(`Fixed cluster ${clusterId} and updated ${sourceIds.length} sources`);
		}

		return {
			success: true,
			dryRun,
			clusterId,
			sourceCount: sourceIds.length,
			before,
			after,
			sourceDetails,
		};
	},
);
