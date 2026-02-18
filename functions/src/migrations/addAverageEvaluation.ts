import { db } from '../index';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Migration script to add averageEvaluation field to all existing statements
 * This calculates: averageEvaluation = sumEvaluations / numberOfEvaluators
 */
export async function migrateAddAverageEvaluation(): Promise<void> {
	try {
		logger.info('Starting migration to add averageEvaluation field');

		const batchSize = 500; // Process in batches to avoid memory issues
		let lastDoc: DocumentSnapshot | undefined;
		let totalUpdated = 0;
		let totalProcessed = 0;

		while (true) {
			// Build query with pagination
			let query = db.collection(Collections.statements).orderBy('__name__').limit(batchSize);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();

			if (snapshot.empty) {
				logger.info(`Migration complete. Processed: ${totalProcessed}, Updated: ${totalUpdated}`);
				break;
			}

			const batch = db.batch();
			let batchCount = 0;

			for (const doc of snapshot.docs) {
				totalProcessed++;
				const statement = doc.data() as Statement;

				// Check if statement has evaluation data that needs updating
				if (
					statement.evaluation &&
					statement.evaluation.numberOfEvaluators !== undefined &&
					statement.evaluation.sumEvaluations !== undefined &&
					statement.evaluation.averageEvaluation === undefined
				) {
					// Calculate average evaluation
					const averageEvaluation =
						statement.evaluation.numberOfEvaluators > 0
							? statement.evaluation.sumEvaluations / statement.evaluation.numberOfEvaluators
							: 0;

					// Update the document
					batch.update(doc.ref, {
						'evaluation.averageEvaluation': averageEvaluation,
					});

					batchCount++;
					totalUpdated++;
				}
			}

			// Commit the batch if there are updates
			if (batchCount > 0) {
				await batch.commit();
				logger.info(
					`Batch updated: ${batchCount} documents. Total updated so far: ${totalUpdated}`,
				);
			}

			// Get the last document for pagination
			lastDoc = snapshot.docs[snapshot.docs.length - 1];
		}

		logger.info('Migration completed successfully');
	} catch (error) {
		logger.error('Error during migration:', error);
		throw error;
	}
}

/**
 * Alternative function to update a single statement's averageEvaluation
 * Useful for testing or updating specific documents
 */
export async function updateSingleStatementAverage(statementId: string): Promise<void> {
	try {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await statementRef.get();

		if (!statementDoc.exists) {
			throw new Error(`Statement ${statementId} not found`);
		}

		const statement = statementDoc.data() as Statement;

		if (!statement.evaluation) {
			logger.info(`Statement ${statementId} has no evaluation data`);

			return;
		}

		const averageEvaluation =
			statement.evaluation.numberOfEvaluators > 0
				? statement.evaluation.sumEvaluations / statement.evaluation.numberOfEvaluators
				: 0;

		await statementRef.update({
			'evaluation.averageEvaluation': averageEvaluation,
		});

		logger.info(`Updated statement ${statementId} with averageEvaluation: ${averageEvaluation}`);
	} catch (error) {
		logger.error(`Error updating statement ${statementId}:`, error);
		throw error;
	}
}
