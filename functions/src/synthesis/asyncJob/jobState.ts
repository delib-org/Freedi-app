import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Async-synthesis job state machine — Firestore-driven.
 *
 * Why Firestore-driven (not Pub/Sub):
 *   - The codebase has no Pub/Sub infra today; introducing it would mean a
 *     new dependency, new IAM, new topics to deploy.
 *   - Firestore docs natively give us idempotency (the doc id IS the
 *     idempotency key) and streaming-to-UI (admin UI subscribes to the
 *     same doc that drives the state machine).
 *   - The dispatcher pattern (an `onUpdate` Firestore trigger that routes
 *     to the right phase based on `status`) is already used elsewhere in
 *     this repo for similar workflows.
 *
 * Lifecycle:
 *
 *     queued → loading → clustering → verifying → proposing → ready-for-review
 *
 * Any phase can transition to `failed` (uncaught error) or `cancelled`
 * (admin set `cancelRequested=true`). The dispatcher (`fn_synthesisJobDispatch`)
 * watches the `status` field and invokes the matching phase handler.
 *
 * Each phase handler:
 *   1. Calls `claimPhase(jobId, phase)` — idempotent, returns false if the
 *      phase already ran (skip in that case).
 *   2. Does its work.
 *   3. On success calls `transitionToNext(jobId, payload)` — atomic update
 *      that advances `status` and stamps the phase output.
 *   4. On error calls `markFailed(jobId, error)`.
 */

export type JobStatus =
	| 'queued'
	| 'loading'
	| 'clustering'
	| 'verifying'
	| 'proposing'
	| 'ready-for-review'
	| 'failed'
	| 'cancelled';

export type JobPhase = 'loading' | 'clustering' | 'verifying' | 'proposing';

export interface JobProgress {
	current: number;
	total: number;
	message: string;
}

export interface JobClusterAssignment {
	clusterId: string;
	memberIds: string[];
}

export interface JobVerifiedCluster {
	clusterId: string;
	memberIds: string[];
	medoidId: string;
	verifiedBy: 'cosine+llm' | 'cosine-only';
}

export interface JobProposal {
	groupId: string;
	memberIds: string[];
	suggestedTitle: string;
	suggestedDescription: string;
	suggestedParagraphs: string[];
	reasons: string[];
	cannotSynthesize?: boolean;
	splitReason?: string;
	splitProposal?: string[][];
}

export interface SynthesisJob {
	jobId: string;
	questionId: string;
	status: JobStatus;
	phasesCompleted: JobPhase[];
	progress: JobProgress;
	threshold: number;
	filters: Record<string, unknown>;
	createdBy: string;
	startedAt: number;
	lastHeartbeat: number;
	completedAt?: number;
	cancelRequested?: boolean;
	error?: string;
	// Phase outputs — present once the phase succeeds.
	workingSetIds?: string[];
	clusterAssignments?: JobClusterAssignment[];
	verifiedClusters?: JobVerifiedCluster[];
	proposals?: JobProposal[];
	// Telemetry
	bayesianStats?: {
		inputCount: number;
		keptCount: number;
		prior: number;
		sigma: number;
		cutoff: number;
	};
	embeddingCoverage?: number;
}

const COLLECTION = 'synthesisJobs';

function db() {
	return getFirestore();
}

/**
 * Map: which phase status routes to which work? `queued` is the initial
 * state — the dispatcher promotes it to `loading` once the trigger fires.
 */
export const PHASE_FOR_STATUS: Partial<Record<JobStatus, JobPhase>> = {
	queued: 'loading',
	loading: 'loading',
	clustering: 'clustering',
	verifying: 'verifying',
	proposing: 'proposing',
};

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
	'ready-for-review',
	'failed',
	'cancelled',
]);

export function isTerminal(status: JobStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

interface CreateJobInput {
	questionId: string;
	threshold: number;
	filters: Record<string, unknown>;
	createdBy: string;
}

/**
 * Create a new job in `queued` state. Returns the auto-generated jobId so
 * the caller can hand it back to the UI immediately. The dispatcher's
 * Firestore onCreate trigger picks the doc up in <1s and starts work.
 */
export async function createJob(input: CreateJobInput): Promise<string> {
	const ref = db().collection(COLLECTION).doc();
	const now = Date.now();
	const job: SynthesisJob = {
		jobId: ref.id,
		questionId: input.questionId,
		status: 'queued',
		phasesCompleted: [],
		progress: { current: 0, total: 0, message: 'Job queued' },
		threshold: input.threshold,
		filters: input.filters,
		createdBy: input.createdBy,
		startedAt: now,
		lastHeartbeat: now,
	};
	await ref.set(job);

	return ref.id;
}

export async function getJob(jobId: string): Promise<SynthesisJob | null> {
	const snap = await db().collection(COLLECTION).doc(jobId).get();
	if (!snap.exists) return null;

	return snap.data() as SynthesisJob;
}

/**
 * Atomic claim: advance the job's status into the named phase IFF the
 * phase isn't already in `phasesCompleted` (idempotency) AND the job
 * isn't terminal AND not cancel-requested. Returns true if the caller
 * acquired the work, false if it should skip (already done, terminal,
 * cancelled).
 *
 * Uses a Firestore transaction to make the check-and-set race-free
 * across overlapping retries.
 */
export async function claimPhase(jobId: string, phase: JobPhase): Promise<boolean> {
	const ref = db().collection(COLLECTION).doc(jobId);
	try {
		return await db().runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) return false;
			const job = snap.data() as SynthesisJob;
			if (isTerminal(job.status)) return false;
			if (job.cancelRequested === true) {
				tx.update(ref, {
					status: 'cancelled' as JobStatus,
					completedAt: Date.now(),
				});

				return false;
			}
			if ((job.phasesCompleted ?? []).includes(phase)) return false;

			// Stamp the heartbeat + bump status to the in-progress phase name.
			tx.update(ref, {
				status: phase,
				lastHeartbeat: Date.now(),
				progress: {
					current: 0,
					total: 0,
					message: `Running phase: ${phase}`,
				},
			});

			return true;
		});
	} catch (error) {
		logger.warn('asyncJob.claimPhase failed', {
			jobId,
			phase,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

interface PhaseSuccessInput {
	phase: JobPhase;
	nextStatus: JobStatus;
	/** Phase-specific payload to merge into the job doc. */
	payload: Partial<SynthesisJob>;
	progress?: JobProgress;
}

/**
 * Mark the current phase complete and advance status. Atomic. Idempotent
 * via `phasesCompleted` array — if the same phase tries to transition
 * twice, the second write is a no-op (FieldValue.arrayUnion).
 */
export async function transitionToNext(jobId: string, input: PhaseSuccessInput): Promise<void> {
	const ref = db().collection(COLLECTION).doc(jobId);
	const now = Date.now();
	const update: Record<string, unknown> = {
		...input.payload,
		status: input.nextStatus,
		phasesCompleted: FieldValue.arrayUnion(input.phase),
		lastHeartbeat: now,
	};
	if (input.progress) update.progress = input.progress;
	if (input.nextStatus === 'ready-for-review') update.completedAt = now;
	await ref.update(update);
}

export async function markFailed(jobId: string, error: unknown): Promise<void> {
	const ref = db().collection(COLLECTION).doc(jobId);
	const message = error instanceof Error ? error.message : String(error);
	try {
		await ref.update({
			status: 'failed' as JobStatus,
			error: message.substring(0, 1000),
			lastHeartbeat: Date.now(),
			completedAt: Date.now(),
		});
	} catch (writeError) {
		logger.error('asyncJob.markFailed: write failed', {
			jobId,
			originalError: message,
			writeError: writeError instanceof Error ? writeError.message : String(writeError),
		});
	}
}

export async function markCancelled(jobId: string): Promise<void> {
	const ref = db().collection(COLLECTION).doc(jobId);
	try {
		await ref.update({
			status: 'cancelled' as JobStatus,
			cancelRequested: true,
			lastHeartbeat: Date.now(),
			completedAt: Date.now(),
		});
	} catch (error) {
		logger.warn('asyncJob.markCancelled: write failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Heartbeat: bump `lastHeartbeat` so the sweep job knows we're alive.
 * Phase handlers should call this every ~30s during long work.
 */
export async function heartbeat(jobId: string, message?: string): Promise<void> {
	const ref = db().collection(COLLECTION).doc(jobId);
	const update: Record<string, unknown> = { lastHeartbeat: Date.now() };
	if (message) update['progress.message'] = message;
	try {
		await ref.update(update);
	} catch (error) {
		// Heartbeat failure is non-fatal — the sweep will retry the phase.
		logger.warn('asyncJob.heartbeat: write failed', {
			jobId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Set the cancel flag without forcing the status terminal. The active
 * phase handler will notice on its next checkpoint and transition the
 * job to `cancelled` itself.
 */
export async function requestCancel(jobId: string): Promise<void> {
	const ref = db().collection(COLLECTION).doc(jobId);
	await ref.update({ cancelRequested: true, lastHeartbeat: Date.now() });
}

export const __INTERNAL = { COLLECTION };
