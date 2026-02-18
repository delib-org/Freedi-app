/**
 * Evaluation migration logic for the integration feature.
 *
 * When multiple similar statements are integrated into one,
 * this module migrates their evaluations to the new target statement.
 * Users who evaluated multiple source statements get their evaluations
 * averaged to prevent double-counting.
 */

import { logger } from 'firebase-functions/v1';
import { Collections, Evaluation } from '@freedi/shared-types';
import { db } from '../index';
import { FLOOR_STD_DEV } from './agreementCalculation';
import { updateParentTotalEvaluators } from './updateChosenOptions';

// ============================================================================
// TYPES
// ============================================================================

export interface MigrationResult {
	migratedCount: number;
	newEvaluationMetrics: {
		sumEvaluations: number;
		numberOfEvaluators: number;
		sumPro: number;
		sumCon: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		sumSquaredEvaluations: number;
		averageEvaluation: number;
		agreement: number;
	};
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Migrate evaluations from multiple source statements to a new target statement.
 * When a user has evaluated multiple source statements, use their average value.
 * This ensures users don't get "double counted" while preserving their overall opinion.
 *
 * @param sourceStatementIds - IDs of statements being integrated
 * @param targetStatementId - ID of the new integrated statement
 * @param parentId - Parent statement ID
 * @returns Migration result with count and new metrics
 */
export async function migrateEvaluationsToNewStatement(
	sourceStatementIds: string[],
	targetStatementId: string,
	parentId: string,
): Promise<MigrationResult> {
	const result: MigrationResult = {
		migratedCount: 0,
		newEvaluationMetrics: {
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			sumSquaredEvaluations: 0,
			averageEvaluation: 0,
			agreement: 0,
		},
	};

	if (sourceStatementIds.length === 0) {
		return result;
	}

	try {
		// 1. Fetch all evaluations from source statements
		// Track all evaluations per user so we can average them
		const evaluationsByUser = new Map<
			string,
			{ evaluations: number[]; evaluator: Evaluation['evaluator'] }
		>();

		for (const sourceId of sourceStatementIds) {
			const evaluationsSnapshot = await db
				.collection(Collections.evaluations)
				.where('statementId', '==', sourceId)
				.get();

			evaluationsSnapshot.forEach((doc) => {
				const evaluation = doc.data() as Evaluation;
				const userId = evaluation.evaluator?.uid;

				if (!userId || evaluation.evaluation === 0) return;

				const existing = evaluationsByUser.get(userId);

				if (existing) {
					// User already evaluated another source statement - add to their evaluations array
					existing.evaluations.push(evaluation.evaluation);
				} else {
					// First evaluation from this user
					evaluationsByUser.set(userId, {
						evaluations: [evaluation.evaluation],
						evaluator: evaluation.evaluator,
					});
				}
			});
		}

		logger.info(
			`Found ${evaluationsByUser.size} unique evaluators across ${sourceStatementIds.length} statements`,
		);

		// 2. Create new evaluations for the target statement
		const batch = db.batch();
		const now = Date.now();

		// Track metrics
		let sumEvaluations = 0;
		let sumSquaredEvaluations = 0;
		let sumPro = 0;
		let sumCon = 0;
		let numberOfProEvaluators = 0;
		let numberOfConEvaluators = 0;
		let numberOfEvaluators = 0;

		for (const [userId, data] of evaluationsByUser) {
			// Calculate average of user's evaluations across source statements
			const avgEvaluation =
				data.evaluations.reduce((sum, val) => sum + val, 0) / data.evaluations.length;

			const newEvaluationId = `${userId}--${targetStatementId}`;
			const evaluationRef = db.collection(Collections.evaluations).doc(newEvaluationId);

			const newEvaluation: Evaluation & { migratedAt?: number } = {
				evaluationId: newEvaluationId,
				statementId: targetStatementId,
				parentId: parentId,
				evaluatorId: userId,
				evaluator: data.evaluator,
				evaluation: avgEvaluation,
				updatedAt: now,
				migratedAt: now, // Flag to indicate this was created by migration - triggers should skip
			};

			batch.set(evaluationRef, newEvaluation);

			// Update metrics using the averaged evaluation
			sumEvaluations += avgEvaluation;
			sumSquaredEvaluations += avgEvaluation * avgEvaluation;
			if (avgEvaluation > 0) {
				sumPro += avgEvaluation;
				numberOfProEvaluators++;
			} else if (avgEvaluation < 0) {
				sumCon += Math.abs(avgEvaluation);
				numberOfConEvaluators++;
			}
			numberOfEvaluators++;
			result.migratedCount++;

			// Log if user had multiple evaluations that were averaged
			if (data.evaluations.length > 1) {
				logger.info(
					`User ${userId} had ${data.evaluations.length} evaluations [${data.evaluations.join(', ')}], averaged to ${avgEvaluation.toFixed(3)}`,
				);
			}
		}

		// 3. Commit the batch
		await batch.commit();
		logger.info(
			`Created ${result.migratedCount} new evaluations for target statement ${targetStatementId}`,
		);

		// 4. Calculate agreement (consensus) using Mean - SEM with floor
		const averageEvaluation = numberOfEvaluators > 0 ? sumEvaluations / numberOfEvaluators : 0;
		const agreement = calcMigrationAgreement(
			sumEvaluations,
			sumSquaredEvaluations,
			numberOfEvaluators,
		);

		result.newEvaluationMetrics = {
			sumEvaluations,
			numberOfEvaluators,
			sumPro,
			sumCon,
			numberOfProEvaluators,
			numberOfConEvaluators,
			sumSquaredEvaluations,
			averageEvaluation,
			agreement,
		};

		// 5. Update the target statement with the new metrics
		const targetRef = db.collection(Collections.statements).doc(targetStatementId);
		await targetRef.update({
			'evaluation.sumEvaluations': sumEvaluations,
			'evaluation.numberOfEvaluators': numberOfEvaluators,
			'evaluation.sumPro': sumPro,
			'evaluation.sumCon': sumCon,
			'evaluation.numberOfProEvaluators': numberOfProEvaluators,
			'evaluation.numberOfConEvaluators': numberOfConEvaluators,
			'evaluation.sumSquaredEvaluations': sumSquaredEvaluations,
			'evaluation.averageEvaluation': averageEvaluation,
			'evaluation.agreement': agreement,
			consensus: agreement,
			totalEvaluators: numberOfEvaluators,
			lastUpdate: now,
		});

		logger.info(
			`Updated target statement ${targetStatementId} with consensus: ${agreement.toFixed(3)}, evaluators: ${numberOfEvaluators}`,
		);

		// Update parent's total evaluator count to reflect the changes
		await updateParentTotalEvaluators(parentId);

		return result;
	} catch (error) {
		logger.error('Error migrating evaluations:', error);
		throw error;
	}
}

// ============================================================================
// MIGRATION-SPECIFIC CALCULATION HELPERS
// ============================================================================

/**
 * Calculate consensus score for migration using Mean - SEM with uncertainty floor.
 */
function calcMigrationAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcMigrationStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	// Proportional penalty bounded by available range to -1
	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);
	const agreement = mean - penalty;

	return agreement;
}

/**
 * Calculate Standard Error of the Mean with uncertainty floor for migration.
 */
function calcMigrationStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

	const mean = sumEvaluations / numberOfEvaluators;
	const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
	const safeVariance = Math.max(0, variance);
	const observedStdDev = Math.sqrt(safeVariance);
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	return adjustedStdDev / Math.sqrt(numberOfEvaluators);
}
