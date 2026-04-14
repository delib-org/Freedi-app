import { db } from '../index';
import { Collections } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Migration script to backfill top-level query fields on subscription documents.
 *
 * Problem: Subscription documents store parentId, statementType, and topParentId
 * only inside the embedded `statement` object. This forces Firestore queries to use
 * nested field paths (e.g., `statement.parentId`), and requires O(N) fan-out writes
 * to keep the embedded statement in sync.
 *
 * Fix: Copy these immutable fields to top-level fields on each subscription document.
 * Once backfilled, queries can use top-level fields and the fan-out Cloud Function
 * can be removed.
 */

const BATCH_SIZE = 500;

interface MigrationResult {
	totalProcessed: number;
	totalUpdated: number;
	totalSkipped: number;
	totalErrors: number;
}

export async function backfillSubscriptionTopLevelFields(): Promise<MigrationResult> {
	const result: MigrationResult = {
		totalProcessed: 0,
		totalUpdated: 0,
		totalSkipped: 0,
		totalErrors: 0,
	};

	let lastDoc: DocumentSnapshot | undefined;

	logger.info('Starting subscription top-level fields backfill...');

	do {
		let query = db
			.collection(Collections.statementsSubscribe)
			.orderBy('__name__')
			.limit(BATCH_SIZE);

		if (lastDoc) {
			query = query.startAfter(lastDoc);
		}

		const snapshot = await query.get();

		if (snapshot.empty) break;

		const batch = db.batch();
		let batchCount = 0;

		for (const doc of snapshot.docs) {
			result.totalProcessed++;

			try {
				const data = doc.data();

				// Skip if already backfilled
				if (data.parentId && data.statementType) {
					result.totalSkipped++;
					continue;
				}

				const statement = data.statement;
				if (!statement) {
					logger.warn(`Subscription ${doc.id} has no embedded statement, skipping`);
					result.totalSkipped++;
					continue;
				}

				const updates: Record<string, string> = {};

				if (!data.parentId && statement.parentId) {
					updates.parentId = statement.parentId;
				}
				if (!data.statementType && statement.statementType) {
					updates.statementType = statement.statementType;
				}
				if (!data.topParentId) {
					updates.topParentId = statement.topParentId || statement.parentId || '';
				}

				if (Object.keys(updates).length > 0) {
					batch.update(doc.ref, updates);
					batchCount++;
					result.totalUpdated++;
				} else {
					result.totalSkipped++;
				}
			} catch (error) {
				logger.error(`Error processing subscription ${doc.id}:`, error);
				result.totalErrors++;
			}
		}

		if (batchCount > 0) {
			await batch.commit();
			logger.info(
				`Backfilled batch: ${batchCount} updated, ${result.totalProcessed} total processed`,
			);
		}

		lastDoc = snapshot.docs[snapshot.docs.length - 1];
	} while (lastDoc);

	logger.info(
		`Backfill complete: ${result.totalUpdated} updated, ${result.totalSkipped} skipped, ${result.totalErrors} errors out of ${result.totalProcessed} total`,
	);

	return result;
}
