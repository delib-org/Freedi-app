import { db } from '../index';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';

/**
 * Update averageEvaluation for a specific statement and all its child statements
 * @param statementId - The ID of the statement to update (parent statement)
 */
export async function updateStatementAndChildrenAverageEvaluation(statementId: string): Promise<{
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
		logger.info(`Starting averageEvaluation update for statement: ${statementId} and its children`);

		// First, update the parent statement
		await updateSingleStatement(statementId, results);

		// Then, find and update all child statements
		const childrenSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.get();

		logger.info(`Found ${childrenSnapshot.size} child statements`);

		// Process in batches
		const batch = db.batch();
		let batchCount = 0;

		for (const doc of childrenSnapshot.docs) {
			results.processed++;
			const statement = doc.data() as Statement;

			if (
				statement.evaluation &&
				statement.evaluation.numberOfEvaluators !== undefined &&
				statement.evaluation.sumEvaluations !== undefined
			) {
				// Calculate average evaluation
				const averageEvaluation =
					statement.evaluation.numberOfEvaluators > 0
						? statement.evaluation.sumEvaluations / statement.evaluation.numberOfEvaluators
						: 0;

				// Add to batch
				batch.update(doc.ref, {
					'evaluation.averageEvaluation': averageEvaluation,
				});

				batchCount++;
				results.updated++;

				// Commit batch every 500 documents
				if (batchCount >= 500) {
					await batch.commit();
					logger.info(`Batch committed: ${batchCount} documents`);
					batchCount = 0;
				}
			}
		}

		// Commit remaining batch
		if (batchCount > 0) {
			await batch.commit();
			logger.info(`Final batch committed: ${batchCount} documents`);
		}

		logger.info(`Update complete. Processed: ${results.processed}, Updated: ${results.updated}`);

		return results;
	} catch (error) {
		const errorMessage = `Error updating statement ${statementId}: ${error}`;
		logger.error(errorMessage);
		results.errors.push(errorMessage);

		return results;
	}
}

/**
 * Update averageEvaluation for a single statement
 */
async function updateSingleStatement(
	statementId: string,
	results: {
		updated: number;
		processed: number;
		errors: string[];
	},
): Promise<void> {
	try {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await statementRef.get();

		results.processed++;

		if (!statementDoc.exists) {
			const error = `Statement ${statementId} not found`;
			logger.warn(error);
			results.errors.push(error);

			return;
		}

		const statement = statementDoc.data() as Statement;

		if (!statement.evaluation) {
			logger.info(`Statement ${statementId} has no evaluation data`);

			return;
		}

		if (
			statement.evaluation.numberOfEvaluators === undefined ||
			statement.evaluation.sumEvaluations === undefined
		) {
			logger.info(`Statement ${statementId} missing required evaluation fields`);

			return;
		}

		const averageEvaluation =
			statement.evaluation.numberOfEvaluators > 0
				? statement.evaluation.sumEvaluations / statement.evaluation.numberOfEvaluators
				: 0;

		await statementRef.update({
			'evaluation.averageEvaluation': averageEvaluation,
		});

		results.updated++;
		logger.info(`Updated statement ${statementId} with averageEvaluation: ${averageEvaluation}`);
	} catch (error) {
		const errorMessage = `Error updating single statement ${statementId}: ${error}`;
		logger.error(errorMessage);
		results.errors.push(errorMessage);
	}
}
