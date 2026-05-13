import { logger } from 'firebase-functions';
import {
	runLoadingPhase,
	runClusteringPhase,
	runVerifyingPhase,
	runProposingPhase,
} from './phases';
import { isTerminal, type JobStatus, type SynthesisJob } from './jobState';
import { synthesisFlags } from '../featureFlags';

/**
 * Firestore-write dispatcher for the async synthesis job state machine.
 *
 * The dispatcher is wired in `index.ts` as a Firestore onWritten trigger on
 * `synthesisJobs/{jobId}`. Its sole responsibility is to look at the
 * after-doc's `status` field and invoke the matching phase handler.
 *
 *   queued      → runLoadingPhase   (initial entry from `synthesisJobStart`)
 *   loading     → runLoadingPhase   (rare — would only happen if the
 *                                   heartbeat sweep re-queued a stuck phase)
 *   clustering  → runClusteringPhase
 *   verifying   → runVerifyingPhase
 *   proposing   → runProposingPhase
 *   ready-for-review | failed | cancelled → no-op (terminal)
 *
 * The dispatcher itself is fire-and-forget: phase handlers do their own
 * idempotency check via `claimPhase()`, so it's safe for the dispatcher
 * to be invoked twice for the same status (e.g., heartbeat sweep retry).
 *
 * Failure mode: any error inside a phase is caught by the phase's own
 * try/catch and routed through `markFailed`. The dispatcher's job is
 * routing only — never throw from here.
 */

interface DispatchableEvent {
	data?: {
		after?: { exists: boolean; data: () => unknown };
		before?: { exists: boolean; data: () => unknown };
	};
}

function readJobAfter(event: DispatchableEvent): SynthesisJob | null {
	const after = event.data?.after;
	if (!after?.exists) return null;
	const data = after.data();
	if (!data || typeof data !== 'object') return null;

	return data as SynthesisJob;
}

function readJobBefore(event: DispatchableEvent): SynthesisJob | null {
	const before = event.data?.before;
	if (!before?.exists) return null;
	const data = before.data();
	if (!data || typeof data !== 'object') return null;

	return data as SynthesisJob;
}

/**
 * Route a status to its phase function. Returns null for statuses that
 * shouldn't trigger work (terminal or unrecognized). Splitting this out
 * keeps the dispatcher tiny + lets tests assert routing without
 * exercising the actual phase code.
 */
export function pickPhaseRunner(
	status: JobStatus,
): (() => Promise<(jobId: string) => Promise<void>>) | null {
	switch (status) {
		case 'queued':
		case 'loading':
			return async () => runLoadingPhase;
		case 'clustering':
			return async () => runClusteringPhase;
		case 'verifying':
			return async () => runVerifyingPhase;
		case 'proposing':
			return async () => runProposingPhase;
		default:
			return null;
	}
}

/**
 * Should the dispatcher fire for this Firestore write? Returns true ONLY
 * when the status field genuinely changed — otherwise we'd loop endlessly
 * because phase handlers themselves write to the same doc (heartbeats,
 * progress updates).
 *
 * Special case: a brand-new doc (no `before`) always fires.
 */
export function shouldDispatch(before: SynthesisJob | null, after: SynthesisJob | null): boolean {
	if (!after) return false;
	if (isTerminal(after.status)) return false;
	if (!before) return true; // new doc
	if (before.status !== after.status) return true;
	// Edge: heartbeat sweep can intentionally re-stamp the same status with
	// `lastHeartbeat` to nudge the dispatcher. We detect that by checking
	// for the sentinel `_dispatchKick` field (toggled true → false → true)
	// the sweep adds for explicit re-runs.
	if (before._dispatchKick !== after._dispatchKick) return true;

	return false;
}

declare module './jobState' {
	// Augment the SynthesisJob shape with the optional sweep-kick sentinel.
	interface SynthesisJob {
		_dispatchKick?: boolean;
	}
}

/**
 * Top-level handler. Matches the `createFirestoreFunction` callback shape
 * defined in `index.ts`. Always resolves — never propagates errors.
 */
export async function dispatchSynthesisJobWrite(event: DispatchableEvent): Promise<void> {
	if (!synthesisFlags.asyncJobMode) return;

	const after = readJobAfter(event);
	const before = readJobBefore(event);
	if (!shouldDispatch(before, after)) return;
	if (!after) return;

	const runnerLoader = pickPhaseRunner(after.status);
	if (!runnerLoader) return;

	try {
		const runner = await runnerLoader();
		// Fire-and-await — Firebase awaits trigger callbacks. The phase
		// itself respects ≤300s via its function's `timeoutSeconds` option
		// when invoked directly, but here we're inside the dispatcher's
		// timeout. To avoid coupling, we always invoke the phase
		// in-line and let the dispatcher's own timeout cap the work.
		await runner(after.jobId);
	} catch (error) {
		// Phase handlers handle their own errors; this is a defense-in-depth
		// catch so the dispatcher never tears down a Firestore worker.
		logger.error('asyncJob.dispatch: unhandled error from phase', {
			jobId: after.jobId,
			status: after.status,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
