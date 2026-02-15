import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/admin/migrate-evaluation-counts
 *
 * Paginated migration to backfill positiveEvaluations and negativeEvaluations
 * for existing suggestions. Process 20 at a time to avoid timeout.
 *
 * Query params:
 * - limit: number of suggestions to process (default: 20)
 * - startAfter: last processed suggestionId for pagination
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

		const { searchParams } = new URL(request.url);
		const limit = parseInt(searchParams.get('limit') || '20', 10);
		const startAfter = searchParams.get('startAfter');

		const db = getFirestoreAdmin();

		// Build query with pagination
		let query = db
			.collection(Collections.statements)
			.where('statementType', '==', 'option')
			.orderBy('statementId')
			.limit(limit);

		if (startAfter) {
			query = query.startAfter(startAfter);
		}

		const suggestionsSnapshot = await query.get();

		logger.info(`[Migration] Processing ${suggestionsSnapshot.docs.length} suggestions (limit: ${limit})`);

		let updatedCount = 0;
		let skippedCount = 0;
		let lastId: string | null = null;
		const batch = db.batch();

		for (const suggestionDoc of suggestionsSnapshot.docs) {
			const suggestionId = suggestionDoc.id;
			lastId = suggestionId;

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

			updatedCount++;
		}

		// Commit all updates
		if (updatedCount > 0) {
			await batch.commit();
		}

		const hasMore = suggestionsSnapshot.docs.length === limit;

		logger.info(`[Migration] Batch complete: ${updatedCount} updated, ${skippedCount} skipped, hasMore: ${hasMore}`);

		return NextResponse.json({
			success: true,
			message: `Batch complete: ${updatedCount} updated, ${skippedCount} skipped`,
			updatedCount,
			skippedCount,
			hasMore,
			lastId,
		});
	} catch (error) {
		logger.error('[Migration] Error during evaluation counts migration:', error);

		return NextResponse.json(
			{ error: 'Migration failed' },
			{ status: 500 }
		);
	}
}
