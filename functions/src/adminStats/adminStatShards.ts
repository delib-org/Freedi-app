/**
 * Sharded write path for the per-period admin counters that move on every
 * rating, vote and join.
 *
 * Each of those used to write the same three platform-wide documents (day,
 * month, year), which is exactly what a single Firestore document cannot take
 * under load: past about one write a second the commits queue and fail, and a
 * failed stat is dropped. Now each event increments one of several shards per
 * period, and a scheduled drain moves the shards' `pending` counts onto the
 * canonical document.
 *
 * The canonical documents and their ids do not change, so the Admin app reads
 * them as before; its numbers trail by at most one drain interval.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';

export const ADMIN_STAT_SHARD_COUNT = 10;
/** Upper bound on shards drained by one run; the next run picks up the rest. */
const DRAIN_PAGE_LIMIT = 500;
const SHARD_SEPARATOR = '__shard';

export interface StatPeriod {
	/** Canonical document id, e.g. `evaluations_2026-11-10`. */
	docId: string;
	collection: string;
	periodType: string;
	periodKey: string;
}

export function getAdminStatShardId(canonicalDocId: string, shard: number): string {
	return `${canonicalDocId}${SHARD_SEPARATOR}${shard}`;
}

/** Adds one to a random shard of each period. No read, no shared document. */
export async function incrementShardedStat(periods: StatPeriod[]): Promise<void> {
	const batch = db.batch();
	const now = Date.now();

	for (const period of periods) {
		const shard = Math.floor(Math.random() * ADMIN_STAT_SHARD_COUNT);
		batch.set(
			db.collection(Collections.adminStats).doc(getAdminStatShardId(period.docId, shard)),
			{
				canonicalDocId: period.docId,
				collection: period.collection,
				periodType: period.periodType,
				periodKey: period.periodKey,
				pending: FieldValue.increment(1),
				lastUpdate: now,
			},
			{ merge: true },
		);
	}

	await batch.commit();
}

/**
 * Moves one shard's pending count to its canonical document. A transaction,
 * so a retried or overlapping drain cannot count the same events twice; the
 * pending count is decremented rather than zeroed so a rating landing mid-drain
 * stays pending instead of being erased.
 */
async function drainShard(shard: QueryDocumentSnapshot): Promise<number> {
	return db.runTransaction(async (transaction) => {
		const current = await transaction.get(shard.ref);
		const data = current.data();
		const pending = typeof data?.pending === 'number' ? data.pending : 0;
		if (!data?.canonicalDocId || pending <= 0) return 0;

		transaction.update(shard.ref, { pending: FieldValue.increment(-pending) });
		transaction.set(
			db.collection(Collections.adminStats).doc(data.canonicalDocId),
			{
				collection: data.collection,
				periodType: data.periodType,
				periodKey: data.periodKey,
				total: FieldValue.increment(pending),
				lastUpdate: Date.now(),
			},
			{ merge: true },
		);

		return pending;
	});
}

/** One scheduled pass: moves every waiting count onto its canonical document. */
export async function drainAdminStatShards(): Promise<{ shards: number; events: number }> {
	const snapshot = await db
		.collection(Collections.adminStats)
		.where('pending', '>', 0)
		.limit(DRAIN_PAGE_LIMIT)
		.get();

	const drained = await Promise.all(
		snapshot.docs.map(async (shard) => {
			try {
				return await drainShard(shard);
			} catch (error) {
				// The count stays pending, so the next run moves it.
				logError(error, {
					operation: 'adminStats.drainAdminStatShards',
					metadata: { shardId: shard.id },
				});

				return 0;
			}
		}),
	);

	return { shards: snapshot.size, events: drained.reduce((sum, count) => sum + count, 0) };
}
