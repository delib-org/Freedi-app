/**
 * Admin Stats - Trigger-based incremental counters for KPI time-period aggregation.
 *
 * Each document create/delete increments/decrements 3 stat docs (day + month + year)
 * using FieldValue.increment() with set({merge: true}) to avoid write contention.
 */

import { logger } from 'firebase-functions';
import { FieldValue, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, getAdminStatDocId } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { db } from './index';

// ── Helpers ──────────────────────────────────────────────────────────

interface PeriodKeys {
	day: string; // 'YYYY-MM-DD'
	month: string; // 'YYYY-MM'
	year: string; // 'YYYY'
}

/**
 * Derives the three period keys (day, month, year) from a millisecond timestamp.
 * Falls back to Date.now() if the input is falsy.
 */
export function getPeriodKeys(timestampMs?: number): PeriodKeys {
	const d = new Date(timestampMs || Date.now());
	const yyyy = d.getUTCFullYear().toString();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');

	return {
		day: `${yyyy}-${mm}-${dd}`,
		month: `${yyyy}-${mm}`,
		year: yyyy,
	};
}

interface IncrementFields {
	/** Extra fields to increment alongside `total` (e.g. byType.option, byApp.main) */
	[fieldPath: string]: number;
}

/**
 * Batch-writes FieldValue.increment to 3 period docs (day + month + year).
 * Uses set({merge: true}) so missing docs are created automatically.
 *
 * @param collectionName - The source collection (e.g. 'statements')
 * @param periodKeys - The three period keys
 * @param extraFields - Additional fields to increment (dot-notation paths)
 * @param delta - Increment value (1 for create, -1 for delete)
 */
async function incrementStat(
	collectionName: string,
	periodKeys: PeriodKeys,
	extraFields: IncrementFields,
	delta: number,
): Promise<void> {
	const batch = db.batch();
	const now = Date.now();

	const periods: Array<{ key: string; type: string }> = [
		{ key: periodKeys.day, type: 'day' },
		{ key: periodKeys.month, type: 'month' },
		{ key: periodKeys.year, type: 'year' },
	];

	for (const period of periods) {
		const docId = getAdminStatDocId(collectionName, period.key);
		const ref = db.collection(Collections.adminStats).doc(docId);

		const data: Record<string, unknown> = {
			collection: collectionName,
			periodType: period.type,
			periodKey: period.key,
			total: FieldValue.increment(delta),
			lastUpdate: now,
		};

		// Add extra increments
		for (const [fieldPath, value] of Object.entries(extraFields)) {
			data[fieldPath] = FieldValue.increment(value * delta);
		}

		batch.set(ref, data, { merge: true });
	}

	await batch.commit();
}

// ── Trigger handlers ─────────────────────────────────────────────────

/**
 * Called when a new statement is created.
 * Increments total + byType + byApp + topLevel.
 */
export async function onStatementCreatedStats(statement: Statement): Promise<void> {
	try {
		const periodKeys = getPeriodKeys(statement.createdAt);
		const statementType = statement.statementType || 'unknown';
		const sourceApp = (statement as Statement & { sourceApp?: string }).sourceApp || 'unknown';

		const extraFields: IncrementFields = {
			[`byType.${statementType}`]: 1,
			[`byApp.${sourceApp}`]: 1,
		};

		if (statement.parentId === 'top') {
			extraFields['topLevel'] = 1;
		}

		await incrementStat('statements', periodKeys, extraFields, 1);
	} catch (error) {
		logger.warn('Admin stats: failed to track statement creation', { error });
	}
}

/**
 * Called when a statement is deleted.
 * Decrements total + byType + byApp + topLevel.
 */
export async function onStatementDeletedStats(statement: Statement): Promise<void> {
	try {
		const periodKeys = getPeriodKeys(statement.createdAt);
		const statementType = statement.statementType || 'unknown';
		const sourceApp = (statement as Statement & { sourceApp?: string }).sourceApp || 'unknown';

		const extraFields: IncrementFields = {
			[`byType.${statementType}`]: 1,
			[`byApp.${sourceApp}`]: 1,
		};

		if (statement.parentId === 'top') {
			extraFields['topLevel'] = 1;
		}

		await incrementStat('statements', periodKeys, extraFields, -1);
	} catch (error) {
		logger.warn('Admin stats: failed to track statement deletion', { error });
	}
}

/**
 * Called when a new evaluation is created.
 */
export async function onEvaluationCreatedStats(createdAt?: number): Promise<void> {
	try {
		const periodKeys = getPeriodKeys(createdAt);
		await incrementStat('evaluations', periodKeys, {}, 1);
	} catch (error) {
		logger.warn('Admin stats: failed to track evaluation creation', { error });
	}
}

/**
 * Called when a new vote is created (first-time vote, not update).
 */
export async function onVoteCreatedStats(createdAt?: number): Promise<void> {
	try {
		const periodKeys = getPeriodKeys(createdAt);
		await incrementStat('votes', periodKeys, {}, 1);
	} catch (error) {
		logger.warn('Admin stats: failed to track vote creation', { error });
	}
}

/**
 * Called when a new subscription is created.
 */
export async function onSubscriptionCreatedStats(createdAt?: number): Promise<void> {
	try {
		const periodKeys = getPeriodKeys(createdAt);
		await incrementStat('statementsSubscribe', periodKeys, {}, 1);
	} catch (error) {
		logger.warn('Admin stats: failed to track subscription creation', { error });
	}
}

// ── Scheduled: daily user count snapshot ─────────────────────────────

/**
 * Snapshots the current user count into day/month/year stat docs.
 * Intended to run daily at 00:10 UTC.
 */
export async function performUserStatsRefresh(): Promise<{ userCount: number }> {
	const usersRef = db.collection(Collections.users);
	const snap = await usersRef.count().get();
	const userCount = snap.data().count;

	const periodKeys = getPeriodKeys(Date.now());
	const now = Date.now();

	const batch = db.batch();
	const periods: Array<{ key: string; type: string }> = [
		{ key: periodKeys.day, type: 'day' },
		{ key: periodKeys.month, type: 'month' },
		{ key: periodKeys.year, type: 'year' },
	];

	for (const period of periods) {
		const docId = getAdminStatDocId('users', period.key);
		const ref = db.collection(Collections.adminStats).doc(docId);
		batch.set(
			ref,
			{
				collection: 'users',
				periodType: period.type,
				periodKey: period.key,
				total: userCount,
				lastUpdate: now,
			},
			{ merge: true },
		);
	}

	await batch.commit();
	logger.info(`Admin stats: refreshed user count = ${userCount}`);

	return { userCount };
}

// ── HTTP: backfill historical data ───────────────────────────────────

import { Request, Response } from 'firebase-functions/v1';

/**
 * One-time backfill function that paginates through all docs in a collection
 * and builds historical aggregate stats.
 *
 * Usage: POST /backfillAdminStats { collection: 'statements' }
 */
export async function backfillAdminStats(req: Request, res: Response): Promise<void> {
	const targetCollection = req.body?.collection as string;

	const allowedCollections = ['statements', 'evaluations', 'votes', 'statementsSubscribe'];

	if (!targetCollection || !allowedCollections.includes(targetCollection)) {
		res.status(400).json({
			error: `Invalid collection. Allowed: ${allowedCollections.join(', ')}`,
		});

		return;
	}

	logger.info(`Admin stats backfill: starting for ${targetCollection}`);

	const collectionRef = db.collection(targetCollection);
	const PAGE_SIZE = 500;
	let lastDoc: QueryDocumentSnapshot | undefined;
	let processedCount = 0;

	// Aggregate in memory first, then write all at once
	const aggregates = new Map<string, Record<string, unknown>>();
	while (true) {
		let q = collectionRef.orderBy('createdAt', 'asc').limit(PAGE_SIZE);
		if (lastDoc) {
			q = q.startAfter(lastDoc);
		}

		const snap = await q.get();
		if (snap.empty) break;

		for (const docSnap of snap.docs) {
			const data = docSnap.data();
			const createdAt =
				typeof data.createdAt === 'number'
					? data.createdAt
					: (data.createdAt?.toMillis?.() ?? Date.now());

			const periodKeys = getPeriodKeys(createdAt);

			for (const [periodKey, periodType] of [
				[periodKeys.day, 'day'],
				[periodKeys.month, 'month'],
				[periodKeys.year, 'year'],
			] as const) {
				const docId = getAdminStatDocId(targetCollection, periodKey);

				if (!aggregates.has(docId)) {
					aggregates.set(docId, {
						collection: targetCollection,
						periodType,
						periodKey,
						total: 0,
					});
				}

				const agg = aggregates.get(docId)!;
				(agg.total as number) += 1;

				// Statement-specific fields
				if (targetCollection === 'statements') {
					const stmtType = (data.statementType as string) || 'unknown';
					const sourceApp = (data.sourceApp as string) || 'unknown';

					if (!agg.byType) agg.byType = {};
					const byType = agg.byType as Record<string, number>;
					byType[stmtType] = (byType[stmtType] || 0) + 1;

					if (!agg.byApp) agg.byApp = {};
					const byApp = agg.byApp as Record<string, number>;
					byApp[sourceApp] = (byApp[sourceApp] || 0) + 1;

					if (data.parentId === 'top') {
						agg.topLevel = ((agg.topLevel as number) || 0) + 1;
					}
				}
			}
		}

		lastDoc = snap.docs[snap.docs.length - 1];
		processedCount += snap.size;
		logger.info(`Admin stats backfill: processed ${processedCount} ${targetCollection} docs`);
	}

	// Write aggregates to Firestore in batches of 500
	const entries = Array.from(aggregates.entries());
	const now = Date.now();
	let batchCount = 0;

	for (let i = 0; i < entries.length; i += 500) {
		const batch = db.batch();
		const chunk = entries.slice(i, i + 500);

		for (const [docId, agg] of chunk) {
			const ref = db.collection(Collections.adminStats).doc(docId);
			batch.set(ref, { ...agg, lastUpdate: now }, { merge: true });
		}

		await batch.commit();
		batchCount++;
	}

	logger.info(
		`Admin stats backfill: completed for ${targetCollection}. ` +
			`Processed ${processedCount} docs, wrote ${entries.length} stat docs in ${batchCount} batches`,
	);

	res.json({
		collection: targetCollection,
		docsProcessed: processedCount,
		statDocsWritten: entries.length,
		batches: batchCount,
	});
}
