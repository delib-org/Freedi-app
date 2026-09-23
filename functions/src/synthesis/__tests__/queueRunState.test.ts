import {
	applyItemOutcome,
	canAcquireLease,
	estimateEtaMinutes,
	isRunInFlight,
	planQueueWake,
	resolveFinishedItem,
} from '../queue/runState';
import type { ProgressDoc } from '../queue/types';

const NOW = 1_000_000;
const RUN = 900_000;

function progress(overrides: Partial<ProgressDoc> = {}): ProgressDoc {
	return {
		questionId: 'q1',
		enqueuedCount: 114,
		processedCount: 0,
		failedCount: 0,
		pendingCount: 114,
		status: 'running',
		operation: 'recluster',
		rateHint: 50,
		startedAt: RUN,
		lastTickAt: RUN,
		etaMinutes: 14,
		initiatedBy: 'u1',
		...overrides,
	};
}

describe('synthesis queue run state', () => {
	describe('applyItemOutcome', () => {
		it('counts each item as it lands and keeps going', () => {
			const result = applyItemOutcome(progress(), RUN, 'processed', NOW);
			expect(result.keepGoing).toBe(true);
			expect(result.update).toMatchObject({
				processedCount: 1,
				failedCount: 0,
				pendingCount: 113,
				lastTickAt: NOW,
			});
		});

		it('counts a parked failure', () => {
			const result = applyItemOutcome(progress(), RUN, 'failed', NOW);
			expect(result.update).toMatchObject({ processedCount: 0, failedCount: 1, pendingCount: 113 });
		});

		it('writes nothing and stops when a newer run replaced this one', () => {
			const result = applyItemOutcome(progress({ startedAt: RUN + 1 }), RUN, 'processed', NOW);
			expect(result).toEqual({ update: null, keepGoing: false });
		});

		it.each(['cancelled', 'paused'] as const)('records the item but stops once %s', (status) => {
			const result = applyItemOutcome(progress({ status }), RUN, 'processed', NOW);
			expect(result.update).toMatchObject({ processedCount: 1 });
			expect(result.keepGoing).toBe(false);
		});

		it('never completes the run from the count alone', () => {
			const result = applyItemOutcome(progress({ pendingCount: 1 }), RUN, 'processed', NOW);
			expect(result.update?.pendingCount).toBe(0);
			expect(result.update?.status).toBeUndefined();
			expect(result.keepGoing).toBe(true);
		});

		it('clamps a drifted pending count at zero', () => {
			const result = applyItemOutcome(progress({ pendingCount: 0 }), RUN, 'processed', NOW);
			expect(result.update?.pendingCount).toBe(0);
		});
	});

	describe('leases', () => {
		it('lets a worker take a running question with no live lease', () => {
			expect(canAcquireLease(progress(), NOW)).toBe(true);
			expect(canAcquireLease(progress({ workerLeaseUntil: NOW - 1 }), NOW)).toBe(true);
		});

		it('keeps a second worker out while the lease is live', () => {
			expect(canAcquireLease(progress({ workerLeaseUntil: NOW + 1 }), NOW)).toBe(false);
		});

		it('never leases a question that is not running', () => {
			expect(canAcquireLease(progress({ status: 'paused' }), NOW)).toBe(false);
			expect(canAcquireLease(null, NOW)).toBe(false);
		});

		it('treats a cancelled run as in flight until its worker lets go', () => {
			expect(isRunInFlight(progress({ status: 'cancelled', workerLeaseUntil: NOW + 1 }), NOW)).toBe(
				true,
			);
			expect(isRunInFlight(progress({ status: 'cancelled' }), NOW)).toBe(false);
			expect(isRunInFlight(progress({ status: 'paused' }), NOW)).toBe(true);
			expect(isRunInFlight(null, NOW)).toBe(false);
		});
	});

	it('estimates the ETA from the per-item pace', () => {
		expect(estimateEtaMinutes(0)).toBe(0);
		expect(estimateEtaMinutes(114)).toBe(14);
		expect(estimateEtaMinutes(-3)).toBe(0);
	});

	describe('resolveFinishedItem', () => {
		const picked = { enqueuedAt: 100, attempts: 0 };

		it('deletes an item nobody touched while it ran', () => {
			expect(resolveFinishedItem(picked, { enqueuedAt: 100, attempts: 0 }, 3)).toBe('delete');
		});

		it('keeps an item the pipeline re-queued while it ran', () => {
			expect(resolveFinishedItem(picked, { enqueuedAt: 250, attempts: 1 }, 3)).toBe('keep-retry');
		});

		it('keeps a re-queue even within the same millisecond, by its attempt count', () => {
			expect(resolveFinishedItem(picked, { enqueuedAt: 100, attempts: 1 }, 3)).toBe('keep-retry');
		});

		it('parks a retry that has used up its attempts', () => {
			expect(
				resolveFinishedItem({ enqueuedAt: 100, attempts: 2 }, { enqueuedAt: 300, attempts: 3 }, 3),
			).toBe('keep-exhausted');
		});

		it('reports an item that is already gone', () => {
			expect(resolveFinishedItem(picked, null, 3)).toBe('gone');
		});
	});

	describe('planQueueWake', () => {
		it('starts a run when the question has none', () => {
			expect(planQueueWake(null)).toBe('start');
		});

		it('starts a run after the last one completed — the stranded-revisit case', () => {
			expect(planQueueWake(progress({ status: 'completed' }))).toBe('start');
			expect(planQueueWake(progress({ status: 'idle' }))).toBe('start');
			expect(planQueueWake(progress({ status: 'failed' }))).toBe('start');
		});

		it('joins a live run', () => {
			expect(planQueueWake(progress({ status: 'running' }))).toBe('merge');
		});

		it('respects an admin pause or cancel', () => {
			expect(planQueueWake(progress({ status: 'paused' }))).toBe('leave');
			expect(planQueueWake(progress({ status: 'cancelled' }))).toBe('leave');
		});
	});
});
