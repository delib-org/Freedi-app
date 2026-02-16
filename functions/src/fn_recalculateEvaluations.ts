import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from './index';
import {
	Collections,
	Statement,
	Evaluation,
	StatementType,
	StatementEvaluation,
	functionConfig,
} from '@freedi/shared-types';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';
import type { PopperHebbianScore } from '@freedi/shared-types';

// Uncertainty floor for Mean - SEM calculation
const FLOOR_STD_DEV = 0.5;

interface RecalculateRequest {
	statementId: string; // Parent statement ID (the question)
	dryRun?: boolean; // If true, only report what would change without applying
}

interface StatementFix {
	statementId: string;
	statementText?: string; // First 50 chars of statement text for identification
	isClusterOption?: boolean;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		consensus?: number;
	};
}

interface RecalculateResult {
	success: boolean;
	dryRun: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	fixes: StatementFix[]; // Detailed list of changes (applied or would-be-applied)
	errors: string[];
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
 * Data structure for tracking user evaluations in cluster-option recalculation
 */
interface UserEvaluationData {
	evaluation: number;
	isDirect: boolean;
	sourceEvaluations: number[];
}

/**
 * Recalculate evaluation metrics for a cluster-option based on source statements and direct evaluations.
 * Direct evaluations (no migratedAt) take priority over source evaluations.
 *
 * Source statements are found via:
 * 1. integratedOptions array on the cluster statement
 * 2. Statements with integratedInto pointing to this cluster (fallback)
 */
async function recalculateClusterOptionEvaluations(
	statementId: string,
	statement: Statement & { integratedOptions?: string[]; popperHebbianScore?: PopperHebbianScore },
	dryRun: boolean = false,
): Promise<StatementFix | null> {
	let sourceIds = statement.integratedOptions || [];

	// If integratedOptions is empty, try to find sources via integratedInto field
	if (sourceIds.length === 0) {
		const sourcesSnapshot = await db
			.collection(Collections.statements)
			.where('integratedInto', '==', statementId)
			.get();

		sourceIds = sourcesSnapshot.docs.map((doc) => doc.id);

		if (sourceIds.length > 0) {
			logger.info(
				`Found ${sourceIds.length} sources via integratedInto for cluster ${statementId}`,
			);
		}
	}

	if (sourceIds.length === 0) {
		logger.info(`No sources found for cluster ${statementId} - skipping recalculation`);

		return null;
	}

	const userEvaluations = new Map<string, UserEvaluationData>();

	// 1. Collect evaluations from each source statement
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
					existing.sourceEvaluations.reduce((a, b) => a + b, 0) / existing.sourceEvaluations.length;
			} else if (!existing) {
				userEvaluations.set(userId, {
					evaluation: evaluation.evaluation,
					isDirect: false,
					sourceEvaluations: [evaluation.evaluation],
				});
			}
			// If existing.isDirect, skip (direct takes priority)
		}
	}

	// 2. Collect DIRECT evaluations on cluster-option (migratedAt is null/undefined) - these OVERWRITE
	const clusterEvals = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', statementId)
		.get();

	for (const doc of clusterEvals.docs) {
		const evaluation = doc.data() as Evaluation & { migratedAt?: number };
		if (evaluation.migratedAt) continue; // Skip migrated evaluations

		const userId = evaluation.evaluator?.uid;
		if (!userId) continue;

		// Direct evaluation OVERWRITES any source evaluation
		userEvaluations.set(userId, {
			evaluation: evaluation.evaluation,
			isDirect: true,
			sourceEvaluations: [],
		});
	}

	// 3. Calculate metrics from merged evaluations
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

	// Current values for comparison
	const currentEval: StatementEvaluation = statement.evaluation || {
		numberOfEvaluators: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumEvaluations: 0,
		sumPro: 0,
		sumCon: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		agreement: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};

	const before = {
		numberOfEvaluators: currentEval.numberOfEvaluators || 0,
		numberOfProEvaluators: currentEval.numberOfProEvaluators || 0,
		numberOfConEvaluators: currentEval.numberOfConEvaluators || 0,
	};

	// Calculate correct metrics
	const averageEvaluation = totalEvaluators > 0 ? sumEvaluations / totalEvaluators : 0;
	const agreement = calcAgreement(sumEvaluations, sumSquaredEvaluations, totalEvaluators);
	const consensusValid = calculateConsensusValid(
		agreement,
		statement.popperHebbianScore ?? undefined,
	);

	// Build updated evaluation object
	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: totalEvaluators,
		numberOfProEvaluators: proCount,
		numberOfConEvaluators: conCount,
		sumEvaluations,
		sumSquaredEvaluations,
		sumPro,
		sumCon,
		averageEvaluation,
		agreement,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};

	const after = {
		numberOfEvaluators: totalEvaluators,
		numberOfProEvaluators: proCount,
		numberOfConEvaluators: conCount,
		consensus: agreement,
	};

	// Add consensus to before for comparison
	const beforeWithConsensus = {
		...before,
		consensus: statement.consensus ?? 0,
	};

	// Update the statement (unless dry run)
	if (!dryRun) {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		await statementRef.update({
			evaluation: updatedEvaluation,
			totalEvaluators,
			consensus: agreement,
			consensusValid,
			proSum: sumPro,
			conSum: sumCon,
			lastUpdate: Date.now(),
		});

		logger.info(
			`Recalculated cluster-option ${statementId}: ${userEvaluations.size} unique users ` +
				`(${sourceIds.length} sources, direct evaluations took priority)`,
		);
	} else {
		logger.info(
			`[DRY RUN] Would recalculate cluster-option ${statementId}: ${userEvaluations.size} unique users`,
		);
	}

	return {
		statementId,
		statementText: statement.statement?.substring(0, 50),
		isClusterOption: true,
		before: beforeWithConsensus,
		after,
	};
}

/**
 * Recalculate evaluation metrics for a single statement based on actual evaluation documents
 */
async function recalculateSingleStatementEvaluations(
	statementId: string,
	dryRun: boolean = false,
): Promise<StatementFix | null> {
	const statementRef = db.collection(Collections.statements).doc(statementId);
	const statementDoc = await statementRef.get();

	if (!statementDoc.exists) {
		logger.warn(`Statement ${statementId} not found`);

		return null;
	}

	const statement = statementDoc.data() as Statement & {
		popperHebbianScore?: PopperHebbianScore;
		integratedOptions?: string[];
		isCluster?: boolean;
	};

	// If this is a cluster-option (has integratedOptions or isCluster flag), use special logic
	// The recalculateClusterOptionEvaluations function will find sources via integratedInto if needed
	if (
		(statement.integratedOptions && statement.integratedOptions.length > 0) ||
		statement.isCluster === true
	) {
		return recalculateClusterOptionEvaluations(statementId, statement, dryRun);
	}

	// Get all actual evaluations for this statement
	const evaluationsSnapshot = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', statementId)
		.get();

	// Calculate actual counts from evaluation documents
	let actualProCount = 0;
	let actualConCount = 0;
	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;

	evaluationsSnapshot.forEach((doc) => {
		const evaluation = doc.data() as Evaluation;
		const evalValue = evaluation.evaluation;

		if (evalValue > 0) {
			actualProCount++;
			sumPro += evalValue;
		} else if (evalValue < 0) {
			actualConCount++;
			sumCon += Math.abs(evalValue);
		}
		// Neutral evaluations (0) are not counted in numberOfEvaluators

		sumEvaluations += evalValue;
		sumSquaredEvaluations += evalValue * evalValue;
	});

	const totalWithNonZeroEval = actualProCount + actualConCount;

	// Current values - use full type to avoid property access issues
	const currentEval: StatementEvaluation = statement.evaluation || {
		numberOfEvaluators: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumEvaluations: 0,
		sumPro: 0,
		sumCon: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		agreement: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};

	const before = {
		numberOfEvaluators: currentEval.numberOfEvaluators || 0,
		numberOfProEvaluators: currentEval.numberOfProEvaluators || 0,
		numberOfConEvaluators: currentEval.numberOfConEvaluators || 0,
	};

	// Check if there's a mismatch
	const hasProMismatch = before.numberOfProEvaluators !== actualProCount;
	const hasConMismatch = before.numberOfConEvaluators !== actualConCount;
	const hasEvaluatorMismatch = before.numberOfEvaluators !== totalWithNonZeroEval;

	if (!hasProMismatch && !hasConMismatch && !hasEvaluatorMismatch) {
		return null; // No fix needed
	}

	// Calculate correct metrics
	const averageEvaluation = totalWithNonZeroEval > 0 ? sumEvaluations / totalWithNonZeroEval : 0;
	const agreement = calcAgreement(sumEvaluations, sumSquaredEvaluations, totalWithNonZeroEval);
	const consensusValid = calculateConsensusValid(
		agreement,
		statement.popperHebbianScore ?? undefined,
	);

	// Build updated evaluation object
	const updatedEvaluation: StatementEvaluation = {
		...currentEval,
		numberOfEvaluators: totalWithNonZeroEval,
		numberOfProEvaluators: actualProCount,
		numberOfConEvaluators: actualConCount,
		sumEvaluations,
		sumSquaredEvaluations,
		sumPro,
		sumCon,
		averageEvaluation,
		agreement,
		evaluationRandomNumber: currentEval.evaluationRandomNumber ?? Math.random(),
		viewed: currentEval.viewed ?? 0,
	};

	const after = {
		numberOfEvaluators: totalWithNonZeroEval,
		numberOfProEvaluators: actualProCount,
		numberOfConEvaluators: actualConCount,
		consensus: agreement,
	};

	// Add consensus to before for comparison
	const beforeWithConsensus = {
		...before,
		consensus: statement.consensus ?? 0,
	};

	// Update the statement (unless dry run)
	if (!dryRun) {
		await statementRef.update({
			evaluation: updatedEvaluation,
			totalEvaluators: totalWithNonZeroEval,
			consensus: agreement,
			consensusValid,
			proSum: sumPro,
			conSum: sumCon,
			lastUpdate: Date.now(),
		});
	} else {
		logger.info(`[DRY RUN] Would fix ${statementId}`);
	}

	return {
		statementId,
		statementText: statement.statement?.substring(0, 50),
		isClusterOption: false,
		before: beforeWithConsensus,
		after,
	};
}

/**
 * Update parent's total evaluators count based on unique evaluators
 */
async function updateParentTotalEvaluators(
	parentId: string,
	dryRun: boolean = false,
): Promise<number> {
	const evaluationsSnapshot = await db
		.collection(Collections.evaluations)
		.where('parentId', '==', parentId)
		.get();

	const uniqueEvaluators = new Set<string>();
	evaluationsSnapshot.forEach((doc) => {
		const evaluation = doc.data() as Evaluation;
		if (evaluation.evaluator?.uid && evaluation.evaluation !== 0) {
			uniqueEvaluators.add(evaluation.evaluator.uid);
		}
	});

	const totalUniqueEvaluators = uniqueEvaluators.size;

	const parentRef = db.collection(Collections.statements).doc(parentId);
	const parentDoc = await parentRef.get();

	if (parentDoc.exists && !dryRun) {
		const parentData = parentDoc.data() as Statement;
		const parentEvaluation: StatementEvaluation = parentData.evaluation || {
			agreement: 0,
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			sumSquaredEvaluations: 0,
			averageEvaluation: 0,
			evaluationRandomNumber: Math.random(),
			viewed: 0,
		};

		parentEvaluation.asParentTotalEvaluators = totalUniqueEvaluators;

		await parentRef.update({
			evaluation: parentEvaluation,
			totalEvaluators: totalUniqueEvaluators,
			lastUpdate: Date.now(),
		});
	} else if (dryRun) {
		logger.info(
			`[DRY RUN] Would update parent ${parentId} totalEvaluators to ${totalUniqueEvaluators}`,
		);
	}

	return totalUniqueEvaluators;
}

/**
 * Firebase callable function to recalculate all evaluation data for a question's options
 */
export const recalculateStatementEvaluations = onCall<RecalculateRequest>(
	{ region: functionConfig.region },
	async (request): Promise<RecalculateResult> => {
		const { statementId, dryRun = false } = request.data;

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		// Check if user is authenticated
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const userId = request.auth.uid;

		// Check if user has admin access to this statement
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

		if (!statementDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}

		const statement = statementDoc.data() as Statement;

		// Check if user is the creator or has admin role
		const isCreator = statement.creatorId === userId;

		if (!isCreator) {
			// Check if user is an admin for this statement
			const adminDoc = await db
				.collection(Collections.statementsSubscribe)
				.doc(`${userId}--${statementId}`)
				.get();

			if (!adminDoc.exists) {
				throw new HttpsError(
					'permission-denied',
					'User is not authorized to recalculate this statement',
				);
			}

			const adminData = adminDoc.data();
			if (adminData?.role !== 'admin') {
				throw new HttpsError(
					'permission-denied',
					'User must be an admin to recalculate evaluations',
				);
			}
		}

		const modeLabel = dryRun ? '[DRY RUN] ' : '';
		logger.info(
			`${modeLabel}Starting recalculation for statement ${statementId} by user ${userId}`,
		);

		const result: RecalculateResult = {
			success: true,
			dryRun,
			statementsProcessed: 0,
			statementsFixed: 0,
			fixes: [],
			errors: [],
		};

		try {
			// Get all option statements under this parent
			const optionsSnapshot = await db
				.collection(Collections.statements)
				.where('parentId', '==', statementId)
				.where('statementType', '==', StatementType.option)
				.get();

			logger.info(`${modeLabel}Found ${optionsSnapshot.size} options to process`);

			for (const doc of optionsSnapshot.docs) {
				result.statementsProcessed++;

				try {
					const fix = await recalculateSingleStatementEvaluations(doc.id, dryRun);
					if (fix) {
						result.statementsFixed++;
						result.fixes.push(fix);
						logger.info(
							`${modeLabel}${fix.isClusterOption ? 'Cluster ' : ''}${doc.id}: ` +
								`pro ${fix.before.numberOfProEvaluators} -> ${fix.after.numberOfProEvaluators}, ` +
								`con ${fix.before.numberOfConEvaluators} -> ${fix.after.numberOfConEvaluators}`,
						);
					}
				} catch (error) {
					const errorMsg = `Failed to process ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
					result.errors.push(errorMsg);
					logger.error(errorMsg);
				}
			}

			// Also recalculate the parent statement's total evaluators
			await updateParentTotalEvaluators(statementId, dryRun);

			logger.info(
				`${modeLabel}Recalculation complete: ${result.statementsProcessed} processed, ` +
					`${result.statementsFixed} ${dryRun ? 'would be fixed' : 'fixed'}`,
			);

			return result;
		} catch (error) {
			logger.error(`${modeLabel}Recalculation failed:`, error);
			throw new HttpsError(
				'internal',
				`Recalculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	},
);
