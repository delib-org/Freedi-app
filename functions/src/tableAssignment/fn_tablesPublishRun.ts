import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignmentRun,
	TablesPublishRunRequest,
	TablesPublishRunResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { loadRunInputs } from './runInputs';
import { actorFrom, assertHost, readSession, requireId, runRef, sessionRef } from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * `tablesPublishRun` (host, ranked mode): makes a 'ready' run the session's
 * published seating. Refused ("stale") when registrations, preferences,
 * positions, topics or settings changed since the run was computed. Runs in
 * one transaction, so clients never see a published id whose run is not
 * published: run -> 'published', the previously published run -> 'superseded',
 * session.publishedRunId and status 'published'. Publishing the run that is
 * already published again is a no-op (idempotent).
 */
export async function publishRun(
	firestore: Firestore,
	uid: string,
	req: TablesPublishRunRequest,
	now: number = Date.now(),
): Promise<TablesPublishRunResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const runId = requireId(req?.runId, 'runId');

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (session.mode !== 'ranked') {
			throw new TablesError('failed-precondition', 'Only ranked sessions are published');
		}
		const runSnap = await tx.get(runRef(firestore, runId));
		const run = runSnap.exists ? (runSnap.data() as TableAssignmentRun) : undefined;
		if (!run || run.sessionId !== sessionId) throw new TablesError('not-found', 'Run not found');

		if (run.status === 'published' && session.publishedRunId === runId) {
			return { publishedRunId: runId };
		}
		if (session.status === 'draft' || session.status === 'ended') {
			throw new TablesError(
				'failed-precondition',
				`Cannot publish while the session is ${session.status}`,
			);
		}
		if (run.status !== 'ready') {
			throw new TablesError('failed-precondition', `Run is ${run.status}, not ready`);
		}
		const { inputHash } = await loadRunInputs(firestore, (q) => tx.get(q), session);
		if (inputHash !== run.inputHash) {
			throw new TablesError(
				'failed-precondition',
				'The preview is stale: registrations or settings changed. Compute a new one.',
				'stale-run',
			);
		}
		const previousId = session.publishedRunId;
		const previousSnap =
			previousId && previousId !== runId ? await tx.get(runRef(firestore, previousId)) : undefined;

		// ---- writes (all reads are done) ----
		if (previousSnap?.exists) tx.update(previousSnap.ref, { status: 'superseded' });
		tx.update(runSnap.ref, { status: 'published', publishedAt: now });
		tx.update(sessionRef(firestore, sessionId), {
			publishedRunId: runId,
			status: 'published',
			lastUpdate: now,
		});

		return { publishedRunId: runId };
	});
}

export const tablesPublishRun = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (request: CallableRequest<TablesPublishRunRequest>): Promise<TablesPublishRunResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await publishRun(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesPublishRun',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId, runId: request.data?.runId },
			});
		}
	},
);
