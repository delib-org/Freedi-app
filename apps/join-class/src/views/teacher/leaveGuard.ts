import { captureException } from '@/lib/sentry';

/**
 * Leaving the plan screen from the teacher bar (docs/ia/join-class-lesson-plan.md 14.5):
 * both bar links first flush the unsaved fields, so the blur that starts a save happens
 * while the screen's state is still intact. Then:
 *   - the flush finished, nothing failed: go;
 *   - the flush is still running after LEAVE_FLUSH_LIMIT_MS (offline, a hung write): go
 *     anyway, a started save continues after navigation;
 *   - a save failed: stay, so the screen's own error and retry show; the next press leaves.
 * A second press while the first is still waiting leaves at once.
 */

/** How long the bar waits for the pending saves before it leaves anyway. */
export const LEAVE_FLUSH_LIMIT_MS = 2000;

export interface LeaveGuardDeps {
	/** Blurs the field being edited and waits for every save in flight. */
	flush: () => Promise<void>;
	/** True while a save has failed and its error is on screen. */
	hasError: () => boolean;
	navigate: (href: string) => void;
}

export interface LeaveGuard {
	leave: (href: string) => Promise<void>;
	/** Forget a previous "stayed because a save failed" (a new screen opened). */
	reset: () => void;
}

type FlushResult = 'done' | 'failed' | 'timeout';

function flushWithLimit(deps: LeaveGuardDeps): Promise<FlushResult> {
	return new Promise<FlushResult>((resolve) => {
		const timer = setTimeout(() => resolve('timeout'), LEAVE_FLUSH_LIMIT_MS);
		deps
			.flush()
			.then(() => resolve('done'))
			.catch((err: unknown) => {
				captureException(err, { operation: 'leaveGuard.flush' });
				resolve('failed');
			})
			.finally(() => clearTimeout(timer));
	});
}

export function createLeaveGuard(deps: LeaveGuardDeps): LeaveGuard {
	let waiting = false;
	let stayed = false;
	let attempt = 0;

	const go = (href: string): void => {
		attempt += 1;
		waiting = false;
		stayed = false;
		deps.navigate(href);
	};

	async function leave(href: string): Promise<void> {
		// the second press: the first is still waiting, or it stayed on a failed save
		if (waiting || (stayed && deps.hasError())) {
			go(href);

			return;
		}
		attempt += 1;
		const mine = attempt;
		waiting = true;
		const result = await flushWithLimit(deps);
		if (mine !== attempt) return; // a second press already left
		waiting = false;
		if (result === 'failed' || (result === 'done' && deps.hasError())) {
			stayed = true;

			return;
		}
		go(href);
	}

	return {
		leave,
		reset() {
			waiting = false;
			stayed = false;
			attempt += 1;
		},
	};
}
