import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	SCHEDULED_ACTION_STALE_CLAIM_MS,
	ScheduledAction,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { executeScheduledAction } from './scheduledActionExecutor';

const SWEEP_LIMIT = 50;

export interface SweepResult {
	executed: number;
	failed: number;
	skipped: number;
}

/**
 * Claims one action with a transaction so overlapping sweeps never run the
 * same action twice. Returns false when someone else got there first.
 */
async function claim(actionId: string, now: number): Promise<ScheduledAction | null> {
	const ref = db.collection(Collections.scheduledActions).doc(actionId);

	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) return null;
		const action = snap.data() as ScheduledAction;
		const staleClaim =
			action.status === 'running' &&
			typeof action.claimedAt === 'number' &&
			now - action.claimedAt >= SCHEDULED_ACTION_STALE_CLAIM_MS;
		if (action.status !== 'pending' && !staleClaim) return null;
		tx.update(ref, { status: 'running', claimedAt: now, lastUpdate: now });

		return { ...action, status: 'running', claimedAt: now };
	});
}

async function loadDue(now: number): Promise<ScheduledAction[]> {
	const due = await db
		.collection(Collections.scheduledActions)
		.where('status', '==', 'pending')
		.where('runAt', '<=', now)
		.orderBy('runAt', 'asc')
		.limit(SWEEP_LIMIT)
		.get();
	const stale = await db
		.collection(Collections.scheduledActions)
		.where('status', '==', 'running')
		.where('claimedAt', '<=', now - SCHEDULED_ACTION_STALE_CLAIM_MS)
		.limit(SWEEP_LIMIT)
		.get();

	return [...due.docs, ...stale.docs].map((doc) => doc.data() as ScheduledAction);
}

/** Testable body of the scheduler. Never throws out of the loop. */
export async function runScheduledActionSweep(now: number = Date.now()): Promise<SweepResult> {
	const result: SweepResult = { executed: 0, failed: 0, skipped: 0 };
	const candidates = await loadDue(now);
	for (const candidate of candidates) {
		const ref = db.collection(Collections.scheduledActions).doc(candidate.scheduledActionId);
		const action = await claim(candidate.scheduledActionId, now);
		if (!action) {
			result.skipped++;
			continue;
		}
		try {
			await executeScheduledAction(action, now);
			await ref.update({ status: 'done', executedAt: now, lastUpdate: now });
			result.executed++;
		} catch (error) {
			result.failed++;
			const message = error instanceof Error ? error.message : String(error);
			logError(error, {
				operation: 'studio.scheduledAction.execute',
				statementId: action.statementId,
				metadata: { scheduledActionId: action.scheduledActionId, action: action.action },
			});
			await ref.update({ status: 'failed', error: message, executedAt: now, lastUpdate: now });
		}
	}
	if (candidates.length > 0) {
		logger.info('[studioScheduledActionSweep] run', { candidates: candidates.length, ...result });
	}

	return result;
}

/** Every 5 minutes: run due facilitator actions (open/freeze/close/reminder). */
export const studioScheduledActionSweep = onSchedule(
	{
		schedule: 'every 5 minutes',
		region: functionConfig.region,
		timeoutSeconds: 300,
		memory: '512MiB',
	},
	async () => {
		try {
			await runScheduledActionSweep();
		} catch (error) {
			logError(error, { operation: 'studio.scheduledAction.sweep' });
		}
	},
);
