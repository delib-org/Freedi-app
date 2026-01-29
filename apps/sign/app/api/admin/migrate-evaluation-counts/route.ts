import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/admin/migrate-evaluation-counts
 *
 * One-time migration to backfill positiveEvaluations and negativeEvaluations
 * for all existing suggestions based on their evaluations.
 *
 * This is an admin-only endpoint.
 */
export async function POST(request: NextRequest) {
	try {
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);

		if (!userId) {
			return NextResponse.json(
				{ error: 'User not authenticated' },
				{ status: 401 }
			);
		}

		const db = getFirestoreAdmin();

		// Get all suggestions (stored as statements with statementType option)
		const suggestionsSnapshot = await db
			.collection(Collections.statements)
			.where('statementType', '==', 'option')
			.get();

		logger.info(`[Migration] Found ${suggestionsSnapshot.docs.length} suggestion statements to process`);

		let updatedCount = 0;
		let skippedCount = 0;
		const batchSize = 500;
		let batch = db.batch();
		let batchCount = 0;

		for (const suggestionDoc of suggestionsSnapshot.docs) {
			const suggestionId = suggestionDoc.id;

			// Get all evaluations for this suggestion
			const evaluationsSnapshot = await db
				.collection(Collections.evaluations)
				.where('statementId', '==', suggestionId)
				.get();

			if (evaluationsSnapshot.empty) {
				skippedCount++;
				continue;
			}

			let positiveEvaluations = 0;
			let negativeEvaluations = 0;

			evaluationsSnapshot.docs.forEach((evalDoc) => {
				const evalData = evalDoc.data();
				const evalValue = evalData.evaluation || 0;

				if (evalValue > 0) {
					positiveEvaluations++;
				} else if (evalValue < 0) {
					negativeEvaluations++;
				}
			});

			// Update the suggestion with vote counts
			batch.update(suggestionDoc.ref, {
				positiveEvaluations,
				negativeEvaluations,
			});

			batchCount++;
			updatedCount++;

			// Commit batch when reaching limit
			if (batchCount >= batchSize) {
				await batch.commit();
				logger.info(`[Migration] Committed batch of ${batchCount} updates`);
				batch = db.batch();
				batchCount = 0;
			}
		}

		// Commit remaining updates
		if (batchCount > 0) {
			await batch.commit();
			logger.info(`[Migration] Committed final batch of ${batchCount} updates`);
		}

		logger.info(`[Migration] Complete: ${updatedCount} updated, ${skippedCount} skipped (no evaluations)`);

		return NextResponse.json({
			success: true,
			message: `Migration complete: ${updatedCount} suggestions updated, ${skippedCount} skipped`,
			updatedCount,
			skippedCount,
		});
	} catch (error) {
		logger.error('[Migration] Error during evaluation counts migration:', error);

		return NextResponse.json(
			{ error: 'Migration failed' },
			{ status: 500 }
		);
	}
}
