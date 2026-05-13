import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { functionConfig } from '@freedi/shared-types';
import { recomputeSynthCluster, __INTERNAL } from './clusterRecompute';
import { synthesisFlags } from '../featureFlags';

/**
 * Periodically drains the `_clusterRecomputeQueue` collection. Each entry
 * is a request to refresh one cluster's denormalized evaluation aggregate
 * AND its `polarizationIndex/{clusterId}` doc.
 *
 * Why batched + scheduled rather than per-write:
 *   - A viral option could receive many votes in a few seconds. Per-write
 *     recompute would write to the same cluster doc dozens of times per
 *     second, hot-spotting Firestore.
 *   - Coalescing is free with our queue design: the doc id IS the cluster
 *     id, so repeated `set(...)`s under the same id collapse before the
 *     flusher ever reads them.
 *   - 60s lag between a vote and the cluster aggregate update is acceptable
 *     for the UX of cluster-level consensus + collaboration index. The
 *     directly-evaluated member statement still updates synchronously via
 *     the existing trigger path.
 *
 * Reliability:
 *   - Max 200 clusters processed per tick. Excess stays in the queue and
 *     is picked up next tick. Bounded so a poisonous backlog can't blow
 *     the function timeout.
 *   - Per-cluster failure is logged and the queue entry left in place so
 *     the next tick retries. No "dead letter" yet — Ship 3 §"Recovery"
 *     covers the manual recompute script if a cluster gets stuck.
 *   - Honors the `clusterAwarePolarization` flag: when OFF, the flusher
 *     drains the queue but takes no action, so a flag flip stops new work
 *     immediately while still cleaning up stale entries.
 */

const MAX_PER_TICK = 200;

// Region picked to match the rest of the codebase (me-west1 per CLAUDE.md
// feedback memory). functionConfig.region encapsulates that.
export const fn_clusterRecomputeFlush = onSchedule(
	{
		schedule: 'every 1 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 300,
		memory: '512MiB',
	},
	async () => {
		const db = getFirestore();
		const startTime = Date.now();

		try {
			const snap = await db
				.collection(__INTERNAL.QUEUE_COLLECTION)
				.orderBy('pendingRecomputeAt', 'asc')
				.limit(MAX_PER_TICK)
				.get();

			if (snap.empty) {
				return;
			}

			const flagOn = synthesisFlags.clusterAwarePolarization;

			let succeeded = 0;
			let failed = 0;
			let skipped = 0;

			for (const doc of snap.docs) {
				const clusterId = doc.id;
				if (!flagOn) {
					// Flag is OFF — drain without doing real work. Prevents
					// queue buildup if the flag flips off mid-day.
					try {
						await doc.ref.delete();
					} catch (error) {
						logger.warn('clusterRecomputeFlush: drain delete failed', {
							clusterId,
							error: error instanceof Error ? error.message : String(error),
						});
					}
					skipped += 1;
					continue;
				}

				try {
					const result = await recomputeSynthCluster(clusterId);
					await doc.ref.delete();
					succeeded += 1;
					logger.debug('clusterRecomputeFlush.cluster.complete', {
						clusterId,
						updated: result.updated,
						evaluatorCount: result.evaluatorCount,
						consensus: Number(result.consensus.toFixed(3)),
					});
				} catch (error) {
					failed += 1;
					// Leave the queue entry in place — next tick retries.
					logger.warn('clusterRecomputeFlush.cluster.failed', {
						clusterId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			logger.info('clusterRecomputeFlush.complete', {
				queuedAtTick: snap.size,
				succeeded,
				failed,
				skipped,
				flagEnabled: flagOn,
				durationMs: Date.now() - startTime,
			});
		} catch (error) {
			logger.error('clusterRecomputeFlush.fatal', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
