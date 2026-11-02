import { db } from '../index';
import { Collections, Statement, Evaluation, StatementType } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { recomputeOptionCounters } from '../evaluation/recomputeOptionCounters';
import { resolveQuestionPopulation } from '../evaluation/resolveQuestionPopulation';

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

		// One explicit N for the whole question (undefined = no correction).
		const populationSize = await resolveQuestionPopulation(db, parentId);

		for (const doc of optionsSnapshot.docs) {
			results.processed++;
			const statement = doc.data() as Statement;

			try {
				// Get all evaluations for this option
				const evaluationsSnapshot = await db
					.collection(Collections.evaluations)
					.where('statementId', '==', statement.statementId)
					.get();

				// Every evaluation document is a participant, zeros included — the
				// same rule as the live trigger (see recomputeOptionCounters).
				const evals = evaluationsSnapshot.docs.map((evalDoc) => evalDoc.data() as Evaluation);
				const counters = recomputeOptionCounters(evals, populationSize);
				const { numberOfEvaluators, averageEvaluation, agreement: consensus } = counters;

				// Update the statement
				await doc.ref.update({
					'evaluation.sumEvaluations': counters.sumEvaluations,
					'evaluation.sumSquaredEvaluations': counters.sumSquaredEvaluations,
					'evaluation.sumPro': counters.sumPro,
					'evaluation.sumCon': counters.sumCon,
					'evaluation.numberOfEvaluators': numberOfEvaluators,
					'evaluation.numberOfProEvaluators': counters.numberOfProEvaluators,
					'evaluation.numberOfConEvaluators': counters.numberOfConEvaluators,
					'evaluation.averageEvaluation': averageEvaluation,
					'evaluation.agreement': consensus,
					'evaluation.agreementIndex': counters.agreementIndex,
					'evaluation.stakeholderCount': counters.stakeholderCount ?? FieldValue.delete(),
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

// Counters and agreement come from recomputeOptionCounters, which calls the canonical
// calcAgreement (bounded by construction) with the question's explicit N.
