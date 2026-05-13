import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import { db } from './index';
import { Collections, functionConfig, StatementType } from '@freedi/shared-types';
import { bulkRecalculateForParent } from './fn_recalculateEvaluations';

/**
 * Scheduled drift correction for stored evaluation aggregates.
 *
 * Background: Freedi maintains pre-computed evaluation aggregates
 * (`evaluation.numberOfEvaluators`, `consensus`, etc.) on each statement
 * via trigger-based `FieldValue.increment()` writes. Those are fast for
 * live UI, but over time they drift out of sync with the raw evaluations
 * collection — deleted evaluations that didn't roll back, partial writes,
 * schema changes, multiple writers with slightly different math, etc.
 *
 * This scheduled sweep calls the bulk recompute (single-query + batched
 * writes) on every question that had recent activity, bounding drift to
 * the sweep interval. Raw evaluations remain the source of truth; stored
 * aggregates are a cache this job refreshes.
 *
 * Design choices:
 *  - Only touches questions with `lastChildUpdate` in the recent past.
 *    Stale/inactive questions don't drift because nothing is writing to
 *    them, so we skip them entirely.
 *  - Skips questions recalculated manually/automatically recently.
 *  - Caps per-run volume so a single burst of activity can't DoS Firestore.
 *  - Serial per-question with concurrency cap — bulk recompute is already
 *    fast (~2 seconds per question). Many questions in parallel blows
 *    Firestore mutation quota.
 */

/** How far back to look for "recently active" questions. */
const ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Don't recompute more often than this per question. */
const MIN_RECALC_INTERVAL_MS = 45 * 60 * 1000; // 45 min

/** Hard cap per run to protect quota + function timeout. */
const MAX_QUESTIONS_PER_RUN = 25;

/** How many questions to recompute at once. Kept low because each bulk
 *  recalc does batch writes that already hit Firestore hard. */
const CONCURRENCY = 3;

export const evaluationDriftCorrection = onSchedule(
	{
		...functionConfig,
		schedule: 'every 60 minutes',
		timeZone: 'UTC',
		// Override functionConfig's default 300s — drift sweep over ~25 active
		// questions can exceed that on a busy system.
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async () => {
		const now = Date.now();
		const activitySince = now - ACTIVE_WINDOW_MS;

		// Find questions with recent activity. `lastChildUpdate` is bumped
		// whenever a child statement changes (which is what happens when
		// evaluations land). Ordering by it descending picks up the hottest
		// questions first so drift is corrected where it matters most.
		const snap = await db
			.collection(Collections.statements)
			.where('statementType', '==', StatementType.question)
			.where('lastChildUpdate', '>=', activitySince)
			.orderBy('lastChildUpdate', 'desc')
			.limit(MAX_QUESTIONS_PER_RUN * 3) // over-fetch; we filter below
			.get();

		const candidates = snap.docs.filter((doc) => {
			const data = doc.data() as {
				lastEvaluationRecalcAt?: number;
				lastChildUpdate?: number;
			};
			// Skip if we recalculated more recently than MIN interval AND
			// nothing new has happened since then.
			const lastRecalc = data.lastEvaluationRecalcAt ?? 0;
			const lastChild = data.lastChildUpdate ?? 0;
			if (lastRecalc > lastChild) return false; // already caught up
			if (now - lastRecalc < MIN_RECALC_INTERVAL_MS) return false; // too soon

			return true;
		});

		const toProcess = candidates.slice(0, MAX_QUESTIONS_PER_RUN);

		logger.info('evaluationDriftCorrection sweep starting', {
			activeInWindow: snap.size,
			needingRecalc: candidates.length,
			willProcess: toProcess.length,
		});

		let processed = 0;
		let totalFixed = 0;
		const errors: string[] = [];

		// Simple concurrency-cap via rolling Promise.all.
		for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
			const batch = toProcess.slice(i, i + CONCURRENCY);
			await Promise.all(
				batch.map(async (doc) => {
					try {
						const res = await bulkRecalculateForParent(doc.id, false);
						processed++;
						totalFixed += res.statementsFixed;
						await doc.ref.update({ lastEvaluationRecalcAt: Date.now() }).catch(() => {
							// best-effort — status is a sweep hint, not a lock
						});
					} catch (error) {
						const msg = `${doc.id}: ${error instanceof Error ? error.message : String(error)}`;
						errors.push(msg);
						logger.error('evaluationDriftCorrection question failed', { msg });
					}
				}),
			);
		}

		logger.info('evaluationDriftCorrection sweep done', {
			processed,
			totalStatementsFixed: totalFixed,
			errors: errors.length,
		});
	},
);
