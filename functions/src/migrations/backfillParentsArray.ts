import { db } from '../index';
import { Collections } from '@freedi/shared-types';
import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Migration script to backfill the `parents` array on statements created in the last month.
 *
 * Problem: Several apps (MC, Flow) create statements via createStatementObject() without
 * passing the `parents` parameter, resulting in an empty array. This breaks
 * `where('parents', 'array-contains', ...)` queries used by the tree view.
 *
 * Fix: For each statement with an empty/missing `parents` array, walk up the parentId
 * chain to reconstruct the full ancestry and write it back to Firestore.
 */

const BATCH_SIZE = 500;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

interface MigrationResult {
	totalProcessed: number;
	totalUpdated: number;
	totalSkipped: number;
	totalErrors: number;
}

/**
 * Fetches a statement by ID from Firestore.
 * Uses a simple in-memory cache to avoid repeated reads during ancestry walks.
 */
const parentCache = new Map<
	string,
	{ parentId: string; parents?: string[]; topParentId?: string }
>();

async function getParentData(
	statementId: string,
): Promise<{ parentId: string; parents?: string[]; topParentId?: string } | null> {
	if (parentCache.has(statementId)) {
		return parentCache.get(statementId)!;
	}

	const doc = await db.collection(Collections.statements).doc(statementId).get();
	if (!doc.exists) return null;

	const data = doc.data()!;
	const result = {
		parentId: data.parentId as string,
		parents: data.parents as string[] | undefined,
		topParentId: data.topParentId as string | undefined,
	};
	parentCache.set(statementId, result);

	return result;
}

/**
 * Walks up the parentId chain to build the full parents array.
 * The parents array should contain all ancestor IDs from the top parent down to the direct parent.
 *
 * Example: For a statement at depth 3:
 *   topParent -> question -> option -> thisStatement
 *   parents = [topParentId, questionId, optionId]
 */
async function buildParentsArray(parentId: string, maxDepth = 20): Promise<string[]> {
	if (!parentId || parentId === 'top') return [];

	const ancestors: string[] = [];
	let currentId = parentId;
	let depth = 0;

	while (currentId && currentId !== 'top' && depth < maxDepth) {
		ancestors.unshift(currentId); // prepend so order is top-down

		const parentData = await getParentData(currentId);
		if (!parentData) break;

		// If this ancestor already has a valid parents array, use it as a shortcut
		if (parentData.parents && parentData.parents.length > 0) {
			ancestors.unshift(...parentData.parents.filter((id) => !ancestors.includes(id)));
			break;
		}

		currentId = parentData.parentId;
		depth++;
	}

	// Deduplicate while preserving order
	return [...new Set(ancestors)];
}

/**
 * Run the migration on statements created in the last month that have empty parents arrays.
 */
export async function migrateBackfillParents(): Promise<MigrationResult> {
	try {
		const cutoffTime = Date.now() - ONE_MONTH_MS;
		logger.info('Starting parents array backfill migration', {
			cutoffDate: new Date(cutoffTime).toISOString(),
		});

		let lastDoc: DocumentSnapshot | undefined;
		let totalProcessed = 0;
		let totalUpdated = 0;
		let totalSkipped = 0;
		let totalErrors = 0;

		// Clear parent cache for fresh run
		parentCache.clear();

		while (true) {
			// Query statements created in the last month
			let query = db
				.collection(Collections.statements)
				.where('createdAt', '>=', cutoffTime)
				.orderBy('createdAt')
				.limit(BATCH_SIZE);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();

			if (snapshot.empty) {
				logger.info('No more documents to process');
				break;
			}

			const batch = db.batch();
			let batchCount = 0;

			for (const doc of snapshot.docs) {
				totalProcessed++;
				const data = doc.data();
				const parentId = data.parentId as string;

				// Skip top-level statements (no parent to link to)
				if (!parentId || parentId === 'top') {
					totalSkipped++;
					continue;
				}

				// Skip if parents array is already populated
				const existingParents = data.parents as string[] | undefined;
				if (existingParents && existingParents.length > 0) {
					totalSkipped++;
					continue;
				}

				try {
					const parents = await buildParentsArray(parentId);

					if (parents.length === 0) {
						totalSkipped++;
						continue;
					}

					// Also fix topParentId if it's missing
					const updateData: Record<string, unknown> = { parents };
					if (!data.topParentId) {
						updateData.topParentId = parents[0]; // first ancestor is the top parent
					}

					batch.update(doc.ref, updateData);
					batchCount++;
					totalUpdated++;
				} catch (error) {
					totalErrors++;
					logger.error(`Error building parents for ${doc.id}:`, error);
				}
			}

			if (batchCount > 0) {
				await batch.commit();
				logger.info(
					`Batch updated: ${batchCount} documents. Total updated so far: ${totalUpdated}`,
				);
			}

			lastDoc = snapshot.docs[snapshot.docs.length - 1];
		}

		parentCache.clear();

		logger.info('Migration completed', {
			totalProcessed,
			totalUpdated,
			totalSkipped,
			totalErrors,
		});

		return { totalProcessed, totalUpdated, totalSkipped, totalErrors };
	} catch (error) {
		logger.error('Error during parents array backfill migration:', error);
		throw error;
	}
}

/**
 * Get statistics about parents array coverage for recent statements.
 * Scans documents created in the last month, counting those with/without parents.
 */
export async function getParentsBackfillStats(): Promise<{
	totalRecent: number;
	withParents: number;
	withoutParents: number;
	coveragePercent: number;
}> {
	try {
		const cutoffTime = Date.now() - ONE_MONTH_MS;

		let totalRecent = 0;
		let withoutParents = 0;
		let lastDoc: DocumentSnapshot | undefined;

		while (true) {
			let query = db
				.collection(Collections.statements)
				.where('createdAt', '>=', cutoffTime)
				.orderBy('createdAt')
				.limit(BATCH_SIZE);

			if (lastDoc) {
				query = query.startAfter(lastDoc);
			}

			const snapshot = await query.get();
			if (snapshot.empty) break;

			for (const doc of snapshot.docs) {
				const data = doc.data();
				const parentId = data.parentId as string;
				if (!parentId || parentId === 'top') continue;

				totalRecent++;
				const parents = data.parents as string[] | undefined;
				if (!parents || parents.length === 0) {
					withoutParents++;
				}
			}

			lastDoc = snapshot.docs[snapshot.docs.length - 1];
		}

		const withParents = totalRecent - withoutParents;
		const coveragePercent = totalRecent > 0 ? Math.round((withParents / totalRecent) * 100) : 100;

		return { totalRecent, withParents, withoutParents, coveragePercent };
	} catch (error) {
		logger.error('Error getting parents backfill stats:', error);
		throw error;
	}
}
