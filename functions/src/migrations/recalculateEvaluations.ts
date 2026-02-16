import { db } from '../index';
import { Collections, Statement, Evaluation, StatementType } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';

const FLOOR_STD_DEV = 0.5;

/**
 * Recalculate all evaluation metrics for options under a parent statement
 * This recounts from the actual evaluations collection
 */
export async function recalculateOptionsEvaluations(parentId: string): Promise<{
	updated: number;
	processed: number;
	errors: string[];
}> {
	const results = {
		updated: 0,
		processed: 0,
		errors: [] as string[],
	};

	try {
		logger.info(`Starting full evaluation recalculation for parent: ${parentId}`);

		// Get all options under this parent
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get();

		logger.info(`Found ${optionsSnapshot.size} options to recalculate`);

		for (const doc of optionsSnapshot.docs) {
			results.processed++;
			const statement = doc.data() as Statement;

			try {
				// Get all evaluations for this option
				const evaluationsSnapshot = await db
					.collection(Collections.evaluations)
					.where('statementId', '==', statement.statementId)
					.get();

				// Calculate metrics from scratch
				let sumEvaluations = 0;
				let sumSquaredEvaluations = 0;
				let sumPro = 0;
				let sumCon = 0;
				let numberOfEvaluators = 0;

				evaluationsSnapshot.docs.forEach((evalDoc) => {
					const evaluation = evalDoc.data() as Evaluation;
					const value = evaluation.evaluation || 0;

					if (value !== 0) {
						numberOfEvaluators++;
						sumEvaluations += value;
						sumSquaredEvaluations += value * value;

						if (value > 0) {
							sumPro += value;
						} else {
							sumCon += Math.abs(value);
						}
					}
				});

				// Calculate averageEvaluation
				const averageEvaluation = numberOfEvaluators > 0 ? sumEvaluations / numberOfEvaluators : 0;

				// Calculate consensus using Mean - SEM with floor
				const consensus = calcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

				// Update the statement
				await doc.ref.update({
					'evaluation.sumEvaluations': sumEvaluations,
					'evaluation.sumSquaredEvaluations': sumSquaredEvaluations,
					'evaluation.sumPro': sumPro,
					'evaluation.sumCon': sumCon,
					'evaluation.numberOfEvaluators': numberOfEvaluators,
					'evaluation.averageEvaluation': averageEvaluation,
					'evaluation.agreement': consensus,
					consensus: consensus,
					totalEvaluators: numberOfEvaluators,
					lastUpdate: Date.now(),
				});

				results.updated++;
				logger.info(
					`Updated option ${statement.statementId}: evaluators=${numberOfEvaluators}, avg=${averageEvaluation.toFixed(3)}, consensus=${consensus.toFixed(3)}`,
				);
			} catch (error) {
				const errorMsg = `Error processing option ${statement.statementId}: ${error}`;
				logger.error(errorMsg);
				results.errors.push(errorMsg);
			}
		}

		logger.info(
			`Recalculation complete. Processed: ${results.processed}, Updated: ${results.updated}`,
		);

		return results;
	} catch (error) {
		const errorMessage = `Error in recalculateOptionsEvaluations: ${error}`;
		logger.error(errorMessage);
		results.errors.push(errorMessage);

		return results;
	}
}

/**
 * Calculate consensus score using Mean - SEM with uncertainty floor
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	return mean - sem;
}

/**
 * Calculate Standard Error of the Mean with uncertainty floor
 */
function calcStandardError(
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
