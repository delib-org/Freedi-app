import { db } from '../index';
import { Collections, StatementType } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Migration script to add randomSeed field to all existing option statements
 * This enables efficient random sampling for the mass-consensus module
 *
 * The randomSeed is a number between 0 and 1 that allows for random ordering
 * using Firestore queries instead of client-side shuffling.
 */
export async function migrateAddRandomSeed(parentId?: string): Promise<{
	totalProcessed: number;
	totalUpdated: number;
	totalSkipped: number;
}> {
	try {
		logger.info('Starting migration to add randomSeed field', { parentId });

		const batchSize = 500; // Process in batches to avoid memory issues
		let lastDoc: DocumentSnapshot | undefined;
		let totalUpdated = 0;
		let totalProcessed = 0;
		let totalSkipped = 0;

		while (true) {
			// Build query with pagination
			let query = db.collection(Collections.statements)
				.where('statementType', '==', StatementType.option);

			// If parentId is provided, only update options under that parent
			if (parentId) {
				query = query.where('parentId', '==', parentId);
			}

			query = query.orderBy('__name__').limit(batchSize);

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

				// Skip if randomSeed already exists
				if (data.randomSeed !== undefined) {
					totalSkipped++;
					continue;
				}

				// Add randomSeed field
				batch.update(doc.ref, { randomSeed: Math.random() });
				batchCount++;
				totalUpdated++;
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
		logger.error('Error during randomSeed migration:', error);
		throw error;
	}
}

/**
 * Add randomSeed to a single statement
 * Useful for testing or updating specific documents
 */
export async function addRandomSeedToStatement(statementId: string): Promise<void> {
	try {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await statementRef.get();

		if (!statementDoc.exists) {
			throw new Error(`Statement ${statementId} not found`);
		}

		const data = statementDoc.data();

		if (data?.randomSeed !== undefined) {
			logger.info(`Statement ${statementId} already has randomSeed: ${data.randomSeed}`);
			
return;
		}

		const randomSeed = Math.random();
		await statementRef.update({ randomSeed });

		logger.info(`Added randomSeed ${randomSeed} to statement ${statementId}`);
	} catch (error) {
		logger.error(`Error adding randomSeed to statement ${statementId}:`, error);
		throw error;
	}
}

/**
 * Get statistics about randomSeed field coverage
 */
export async function getRandomSeedStats(): Promise<{
	totalOptions: number;
	withRandomSeed: number;
	withoutRandomSeed: number;
	coveragePercent: number;
}> {
	try {
		// Count total options
		const totalSnapshot = await db.collection(Collections.statements)
			.where('statementType', '==', StatementType.option)
			.count()
			.get();
		const totalOptions = totalSnapshot.data().count;

		// Count options with randomSeed (using a range query to find documents with the field)
		// Note: Firestore doesn't have a direct way to check if field exists,
		// so we check for non-null values
		const withSeedSnapshot = await db.collection(Collections.statements)
			.where('statementType', '==', StatementType.option)
			.where('randomSeed', '>=', 0)
			.count()
			.get();
		const withRandomSeed = withSeedSnapshot.data().count;

		const withoutRandomSeed = totalOptions - withRandomSeed;
		const coveragePercent = totalOptions > 0
			? Math.round((withRandomSeed / totalOptions) * 100)
			: 100;

		return {
			totalOptions,
			withRandomSeed,
			withoutRandomSeed,
			coveragePercent
		};
	} catch (error) {
		logger.error('Error getting randomSeed stats:', error);
		throw error;
	}
}
