import { db } from '../index';
import { Collections, StatementType, QuestionType, evaluationType, EvaluationUI } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Migration script to backfill statementSettings.evaluationType for existing MC questions
 *
 * This ensures that Mass Consensus questions created before the fix have the correct
 * evaluationType set, so the main Freedi app displays the correct evaluation component.
 *
 * Mapping:
 * - EvaluationUI.suggestions / clustering → evaluationType.range (EnhancedEvaluation)
 * - EvaluationUI.voting / checkbox → evaluationType.singleLike (SingleLikeEvaluation)
 * - Default (no evaluationUI set) → evaluationType.range
 */
export async function migrateBackfillEvaluationType(): Promise<{
	totalProcessed: number;
	totalUpdated: number;
	totalSkipped: number;
}> {
	try {
		logger.info('Starting migration to backfill evaluationType for MC questions');

		const batchSize = 500;
		let lastDoc: DocumentSnapshot | undefined;
		let totalUpdated = 0;
		let totalProcessed = 0;
		let totalSkipped = 0;

		while (true) {
			// Query for Mass Consensus questions
			let query = db.collection(Collections.statements)
				.where('statementType', '==', StatementType.question)
				.where('questionSettings.questionType', '==', QuestionType.massConsensus)
				.orderBy('__name__')
				.limit(batchSize);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();

			if (snapshot.empty) {
				logger.info(`Migration complete. Processed: ${totalProcessed}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`);
				break;
			}

			const batch = db.batch();
			let batchCount = 0;

			for (const doc of snapshot.docs) {
				totalProcessed++;
				const data = doc.data();

				// Skip if evaluationType already exists
				if (data.statementSettings?.evaluationType) {
					totalSkipped++;
					continue;
				}

				// Map evaluationUI to evaluationType
				const evalUI = data.evaluationSettings?.evaluationUI as EvaluationUI | undefined;
				let evalType: evaluationType;

				if (evalUI === EvaluationUI.voting || evalUI === EvaluationUI.checkbox) {
					evalType = evaluationType.singleLike;
				} else {
					// suggestions, clustering, or undefined → range
					evalType = evaluationType.range;
				}

				// Update the document
				batch.update(doc.ref, {
					'statementSettings.evaluationType': evalType,
					'statementSettings.enhancedEvaluation': evalType === evaluationType.range,
				});

				batchCount++;
				totalUpdated++;

				logger.info(`Updating question ${doc.id}: evaluationUI=${evalUI} → evaluationType=${evalType}`);
			}

			// Commit the batch if there are updates
			if (batchCount > 0) {
				await batch.commit();
				logger.info(`Batch updated: ${batchCount} documents. Total updated so far: ${totalUpdated}`);
			}

			// Get the last document for pagination
			lastDoc = snapshot.docs[snapshot.docs.length - 1];
		}

		logger.info('Migration completed successfully', {
			totalProcessed,
			totalUpdated,
			totalSkipped
		});

		return { totalProcessed, totalUpdated, totalSkipped };
	} catch (error) {
		logger.error('Error during evaluationType backfill migration:', error);
		throw error;
	}
}

/**
 * Get statistics about evaluationType field coverage for MC questions
 */
export async function getEvaluationTypeStats(): Promise<{
	totalMCQuestions: number;
	withEvaluationType: number;
	withoutEvaluationType: number;
	coveragePercent: number;
}> {
	try {
		// Count total MC questions
		const totalSnapshot = await db.collection(Collections.statements)
			.where('statementType', '==', StatementType.question)
			.where('questionSettings.questionType', '==', QuestionType.massConsensus)
			.count()
			.get();
		const totalMCQuestions = totalSnapshot.data().count;

		// To count those with evaluationType, we need to iterate since Firestore
		// doesn't support querying for nested field existence directly
		let withEvaluationType = 0;
		let lastDoc: DocumentSnapshot | undefined;

		while (true) {
			let query = db.collection(Collections.statements)
				.where('statementType', '==', StatementType.question)
				.where('questionSettings.questionType', '==', QuestionType.massConsensus)
				.orderBy('__name__')
				.limit(500);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();

			if (snapshot.empty) break;

			for (const doc of snapshot.docs) {
				const data = doc.data();
				if (data.statementSettings?.evaluationType) {
					withEvaluationType++;
				}
			}

			lastDoc = snapshot.docs[snapshot.docs.length - 1];
		}

		const withoutEvaluationType = totalMCQuestions - withEvaluationType;
		const coveragePercent = totalMCQuestions > 0
			? Math.round((withEvaluationType / totalMCQuestions) * 100)
			: 100;

		return {
			totalMCQuestions,
			withEvaluationType,
			withoutEvaluationType,
			coveragePercent
		};
	} catch (error) {
		logger.error('Error getting evaluationType stats:', error);
		throw error;
	}
}
