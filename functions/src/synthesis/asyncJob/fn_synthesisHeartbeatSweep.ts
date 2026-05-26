import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { functionConfig } from '@freedi/shared-types';
import { synthesisFlags } from '../featureFlags';
import { __INTERNAL, isTerminal, type SynthesisJob } from './jobState';

/**
 * Heartbeat sweep — recovery for jobs that died mid-phase.
 *
 * A phase function dies (OOM, timeout, transient Firebase fault) without
 * transitioning the job's status. The job is stuck in e.g. `clustering`
 * forever. The dispatcher won't fire again because nothing is writing
 * the doc. Without this sweep, a single dead phase would leave a "ghost"
 * job in the UI that never completes.
 *
 * Every 5 minutes:
 *   1. Find non-terminal jobs whose `lastHeartbeat` aged > 600 s.
 *   2. Toggle the `_dispatchKick` sentinel field. The dispatcher's
 *      `shouldDispatch` recognizes the toggle as a re-run signal and
 *      invokes the matching phase handler.
 *   3. The phase handler's `claimPhase()` is idempotent: if the phase
 *      already completed (rare race), the kick is a no-op. If the phase
 *      genuinely died, the handler runs and either completes or
 *      transitions to `failed`.
 *
 * Bounded: at most STALE_LIMIT jobs per tick. Excess waits for next tick.
 */

const STALE_AGE_MS = 600_000; // 10 minutes
const STALE_LIMIT = 50;

export const fn_synthesisHeartbeatSweep = onSchedule(
	{
		schedule: 'every 5 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 120,
		memory: '256MiB',
	},
	async () => {
		// We sweep regardless of the flag, so a deploy that flips the flag
		// off doesn't leave orphans. But we don't dispatch when the flag
		// is off — we just mark them failed so they stop showing up.
		const db = getFirestore();
		const cutoff = Date.now() - STALE_AGE_MS;
		try {
			const snap = await db
				.collection(__INTERNAL.COLLECTION)
				.where('lastHeartbeat', '<', cutoff)
				.limit(STALE_LIMIT)
				.get();

			if (snap.empty) return;

			let kicked = 0;
			let abandoned = 0;
			for (const doc of snap.docs) {
				const job = doc.data() as SynthesisJob;
				if (isTerminal(job.status)) {
					// Defensive: terminal jobs shouldn't be in this query (their
					// lastHeartbeat won't be touched after completedAt), but if
					// any slipped through, ignore them.
					continue;
				}
				if (!synthesisFlags.asyncJobMode) {
					await doc.ref.update({
						status: 'failed',
						error: 'async-job mode disabled while job was in flight',
						completedAt: Date.now(),
					});
					abandoned += 1;
					continue;
				}
				try {
					await doc.ref.update({
						_dispatchKick: !(job._dispatchKick ?? false),
						lastHeartbeat: Date.now(),
						_sweepKickReason: `lastHeartbeat aged > ${STALE_AGE_MS}ms`,
						_sweepKickAt: FieldValue.serverTimestamp(),
					});
					kicked += 1;
				} catch (error) {
					logger.warn('asyncJob.sweep: kick write failed (skipping)', {
						jobId: job.jobId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			logger.info('asyncJob.sweep.complete', {
				examined: snap.size,
				kicked,
				abandoned,
				flagEnabled: synthesisFlags.asyncJobMode,
			});
		} catch (error) {
			logger.error('asyncJob.sweep.fatal', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
