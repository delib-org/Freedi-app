import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Role, Statement, functionConfig } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { synthesisFlags } from '../featureFlags';
import { createJob, requestCancel } from './jobState';

/**
 * Async-synthesis lifecycle entry points.
 *
 *   - `synthesisJobStart` — admin clicks "Synthesize" → callable creates a
 *     `synthesisJobs/{jobId}` doc in `queued` state and returns the id in
 *     <1 s. The Firestore dispatcher (`fn_synthesisJobDispatch`) picks it
 *     up and runs the four phases.
 *   - `synthesisJobCancel` — admin clicks "Cancel" → callable sets
 *     `cancelRequested: true`. Phase handlers check the flag at entry +
 *     checkpoint boundaries and exit early (transitioning to `cancelled`).
 *
 * Both callables are gated by the SYNTHESIS_ASYNC_JOB_MODE flag; when OFF,
 * they reject so the existing synchronous `synthesizeIdeasPreview` callable
 * stays the only entry point. The OLD callable is left unchanged so the
 * existing UI continues to work — clients opt in to the async path by
 * calling the new functions explicitly.
 */

const DEFAULT_THRESHOLD = 0.9;

interface JobStartRequest {
	parentStatementId: string;
	threshold?: number;
	filters?: Record<string, unknown>;
}

interface JobStartResponse {
	jobId: string;
	status: 'queued';
}

interface JobCancelRequest {
	jobId: string;
}

interface JobCancelResponse {
	cancelRequested: true;
}

async function assertAdmin(parentStatementId: string, userId: string): Promise<Statement> {
	const db = getFirestore();
	const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
	if (!parentDoc.exists) {
		throw new HttpsError('not-found', 'Parent statement not found');
	}
	const parentStatement = parentDoc.data() as Statement;
	const topParentId = parentStatement.topParentId || parentStatementId;

	const membersSnapshot = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', topParentId)
		.where('userId', '==', userId)
		.where('role', 'in', [Role.admin, 'creator', 'admin'])
		.limit(1)
		.get();

	if (membersSnapshot.empty) {
		throw new HttpsError('permission-denied', 'Only admins can run idea synthesis');
	}

	return parentStatement;
}

export const synthesisJobStart = onCall<JobStartRequest>(
	{
		// Sub-second latency target: the callable must do nothing more than
		// auth-check and write one Firestore doc.
		timeoutSeconds: 30,
		memory: '256MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<JobStartResponse> => {
		if (!synthesisFlags.asyncJobMode) {
			throw new HttpsError(
				'failed-precondition',
				'Async synthesis job mode is disabled. Use synthesizeIdeasPreview instead.',
			);
		}
		const userId = request.auth?.uid;
		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { parentStatementId } = request.data;
		if (!parentStatementId) {
			throw new HttpsError('invalid-argument', 'parentStatementId is required');
		}
		await assertAdmin(parentStatementId, userId);

		const threshold = request.data.threshold ?? DEFAULT_THRESHOLD;
		const filters = request.data.filters ?? {};
		const jobId = await createJob({
			questionId: parentStatementId,
			threshold,
			filters,
			createdBy: userId,
		});
		logger.info('synthesisJobStart.queued', { jobId, parentStatementId, userId });

		return { jobId, status: 'queued' };
	},
);

export const synthesisJobCancel = onCall<JobCancelRequest>(
	{
		timeoutSeconds: 30,
		memory: '256MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<JobCancelResponse> => {
		if (!synthesisFlags.asyncJobMode) {
			throw new HttpsError('failed-precondition', 'Async synthesis job mode is disabled.');
		}
		const userId = request.auth?.uid;
		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { jobId } = request.data;
		if (!jobId) {
			throw new HttpsError('invalid-argument', 'jobId is required');
		}

		// We don't re-check admin here — the job doc was created under admin
		// auth and contains `createdBy`. Either the same user or any admin
		// of the same parent should be able to cancel. For minimal scope in
		// v1, gate to the original creator only; we can broaden later.
		const db = getFirestore();
		const ref = db.collection('synthesisJobs').doc(jobId);
		const snap = await ref.get();
		if (!snap.exists) {
			throw new HttpsError('not-found', 'Job not found');
		}
		const job = snap.data() as { createdBy: string };
		if (job.createdBy !== userId) {
			throw new HttpsError('permission-denied', 'Only the job creator can cancel it');
		}
		await requestCancel(jobId);
		logger.info('synthesisJobCancel.requested', { jobId, userId });

		return { cancelRequested: true };
	},
);
