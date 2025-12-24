import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v1";
import { db } from "./index";
import {
	Collections,
	Statement,
	Evaluation,
	StatementType,
	StatementEvaluation,
	functionConfig,
} from "@freedi/shared-types";
import { calculateConsensusValid } from "./helpers/consensusValidCalculator";
import type { PopperHebbianScore } from "delib-npm/dist/models/popper/popperTypes";

// Uncertainty floor for Mean - SEM calculation
const FLOOR_STD_DEV = 0.5;

interface RecalculateRequest {
	statementId: string; // Parent statement ID (the question)
}

interface RecalculateResult {
	success: boolean;
	statementsProcessed: number;
	statementsFixed: number;
	errors: string[];
}

interface StatementFix {
	statementId: string;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
	};
}

/**
 * Calculate agreement using Mean - SEM with uncertainty floor
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
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
 * Recalculate evaluation metrics for a single statement based on actual evaluation documents
 */
async function recalculateSingleStatementEvaluations(
	statementId: string
): Promise<StatementFix | null> {
	const statementRef = db.collection(Collections.statements).doc(statementId);
	const statementDoc = await statementRef.get();

	if (!statementDoc.exists) {
		logger.warn(`Statement ${statementId} not found`);
		return null;
	}

	const statement = statementDoc.data() as Statement & { popperHebbianScore?: PopperHebbianScore };

	// Get all actual evaluations for this statement
	const evaluationsSnapshot = await db
		.collection(Collections.evaluations)
		.where("statementId", "==", statementId)
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
	const consensusValid = calculateConsensusValid(agreement, statement.popperHebbianScore ?? undefined);

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

	// Update the statement
	await statementRef.update({
		evaluation: updatedEvaluation,
		totalEvaluators: totalWithNonZeroEval,
		consensus: agreement,
		consensusValid,
		proSum: sumPro,
		conSum: sumCon,
		lastUpdate: Date.now(),
	});

	const after = {
		numberOfEvaluators: totalWithNonZeroEval,
		numberOfProEvaluators: actualProCount,
		numberOfConEvaluators: actualConCount,
	};

	return {
		statementId,
		before,
		after,
	};
}

/**
 * Update parent's total evaluators count based on unique evaluators
 */
async function updateParentTotalEvaluators(parentId: string): Promise<number> {
	const evaluationsSnapshot = await db
		.collection(Collections.evaluations)
		.where("parentId", "==", parentId)
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

	if (parentDoc.exists) {
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
	}

	return totalUniqueEvaluators;
}

/**
 * Firebase callable function to recalculate all evaluation data for a question's options
 */
export const recalculateStatementEvaluations = onCall<RecalculateRequest>(
	{ region: functionConfig.region },
	async (request): Promise<RecalculateResult> => {
		const { statementId } = request.data;

		if (!statementId) {
			throw new HttpsError("invalid-argument", "statementId is required");
		}

		// Check if user is authenticated
		if (!request.auth) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		const userId = request.auth.uid;

		// Check if user has admin access to this statement
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();

		if (!statementDoc.exists) {
			throw new HttpsError("not-found", "Statement not found");
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
				throw new HttpsError("permission-denied", "User is not authorized to recalculate this statement");
			}

			const adminData = adminDoc.data();
			if (adminData?.role !== "admin") {
				throw new HttpsError("permission-denied", "User must be an admin to recalculate evaluations");
			}
		}

		logger.info(`Starting recalculation for statement ${statementId} by user ${userId}`);

		const result: RecalculateResult = {
			success: true,
			statementsProcessed: 0,
			statementsFixed: 0,
			errors: [],
		};

		try {
			// Get all option statements under this parent
			const optionsSnapshot = await db
				.collection(Collections.statements)
				.where("parentId", "==", statementId)
				.where("statementType", "==", StatementType.option)
				.get();

			logger.info(`Found ${optionsSnapshot.size} options to process`);

			for (const doc of optionsSnapshot.docs) {
				result.statementsProcessed++;

				try {
					const fix = await recalculateSingleStatementEvaluations(doc.id);
					if (fix) {
						result.statementsFixed++;
						logger.info(
							`Fixed ${doc.id}: pro ${fix.before.numberOfProEvaluators} -> ${fix.after.numberOfProEvaluators}, ` +
							`con ${fix.before.numberOfConEvaluators} -> ${fix.after.numberOfConEvaluators}`
						);
					}
				} catch (error) {
					const errorMsg = `Failed to process ${doc.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
					result.errors.push(errorMsg);
					logger.error(errorMsg);
				}
			}

			// Also recalculate the parent statement's total evaluators
			await updateParentTotalEvaluators(statementId);

			logger.info(
				`Recalculation complete: ${result.statementsProcessed} processed, ${result.statementsFixed} fixed`
			);

			return result;
		} catch (error) {
			logger.error("Recalculation failed:", error);
			throw new HttpsError(
				"internal",
				`Recalculation failed: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
);
