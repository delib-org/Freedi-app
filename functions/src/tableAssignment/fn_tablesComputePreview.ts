import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { TableAssignmentError, assignTables } from '@freedi/table-assignment';
import type { Participant, Topic } from '@freedi/table-assignment';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentRun,
	TablesComputePreviewRequest,
	TablesComputePreviewResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { coarseRunFields } from './runPrivacy';
import { loadRunInputs } from './runInputs';
import {
	actorFrom,
	assertHost,
	newId,
	readyRunsQuery,
	requireId,
	runInputRef,
	runRef,
	sessionRef,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

function parseSeed(value: unknown): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new TablesError('invalid-argument', 'seed must be a whole number');
	}

	return value;
}

/**
 * `tablesComputePreview` (host, ranked mode): runs the engine over the
 * registrants and stores the result as a 'ready' TableAssignmentRun that the
 * host can look at before publishing. Older 'ready' runs become 'superseded'.
 * The inputHash lets tablesPublishRun detect that registrations, preferences
 * or settings moved on since this draft; it lives apart from the run, because
 * a hash over a handful of answers can be guessed by trying them all. The balance policy (tolerance as the
 * hard constraint, preferences maximised inside it) is the engine's; nothing
 * is re-implemented here.
 */
export async function computePreview(
	firestore: Firestore,
	uid: string,
	req: TablesComputePreviewRequest,
	now: number = Date.now(),
): Promise<TablesComputePreviewResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const seed = parseSeed(req.seed) ?? now;

	const sessionSnap = await sessionRef(firestore, sessionId).get();
	if (!sessionSnap.exists) throw new TablesError('not-found', 'Session not found');
	const session = sessionSnap.data() as TableAssignment;
	assertHost(session, uid);
	if (session.mode !== 'ranked') {
		throw new TablesError('failed-precondition', 'Only ranked sessions are computed');
	}
	if (session.status === 'draft' || session.status === 'ended') {
		throw new TablesError(
			'failed-precondition',
			`Cannot compute while the session is ${session.status}`,
		);
	}

	const { topics, participants, inputHash } = await loadRunInputs(
		firestore,
		(q) => q.get(),
		session,
	);
	if (participants.length === 0) {
		throw new TablesError('failed-precondition', 'Nobody has registered yet');
	}

	const engineParticipants: Participant[] = participants.map((p) => ({
		id: p.uid,
		side: p.position === undefined ? undefined : [p.position],
		preferences: p.preferences,
	}));
	const engineTopics: Topic[] = topics.map((t) => ({ id: t.topicId, maxTables: t.maxTables }));

	let assignment: ReturnType<typeof assignTables>;
	try {
		assignment = assignTables(engineParticipants, engineTopics, {
			tableSize: session.settings.tableSize,
			balanceTolerance: session.settings.balanceTolerance,
			seed,
		});
	} catch (error) {
		if (error instanceof TableAssignmentError) {
			throw new TablesError('failed-precondition', error.message);
		}
		throw error;
	}

	const runId = newId();
	const run: TableAssignmentRun = {
		runId,
		sessionId,
		seed: assignment.seed,
		status: 'ready',
		...coarseRunFields(assignment),
		inputHash: '',
		createdAt: now,
	};

	// One transaction: the ready runs are read inside it, so a run the host
	// published a moment ago is no longer 'ready' here and is never overwritten.
	await firestore.runTransaction(async (tx) => {
		const older = await tx.get(readyRunsQuery(firestore, sessionId));
		older.docs.forEach((d) => {
			if ((d.data() as TableAssignmentRun).status === 'ready') {
				tx.update(d.ref, { status: 'superseded' });
			}
		});
		tx.set(runRef(firestore, runId), run);
		tx.set(runInputRef(firestore, runId), { sessionId, inputHash });
	});

	return { runId };
}

export const tablesComputePreview = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120, memory: '512MiB' },
	async (
		request: CallableRequest<TablesComputePreviewRequest>,
	): Promise<TablesComputePreviewResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await computePreview(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesComputePreview',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
