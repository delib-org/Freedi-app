import { randomInt } from 'crypto';
import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
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
import {
	ENGINE_SEED_RANGE,
	MAX_PREVIEWS_PER_ANSWERS,
	MAX_PREVIEWS_PER_SESSION,
	MIN_REGISTRANTS_FOR_PREVIEW,
} from './constants';
import { coarseRunFields } from './runPrivacy';
import { loadRunInputs } from './runInputs';
import type { PreviewBudgetDoc } from './tablesAccess';
import {
	actorFrom,
	assertHost,
	newId,
	previewBudgetRef,
	readSession,
	readyRunsQuery,
	requireId,
	runInputRef,
	runRef,
	sessionPreviewBudgetRef,
	sessionRef,
} from './tablesAccess';
import { TablesError, toHttpsError } from './tablesErrors';

/**
 * The engine is public and deterministic, so anyone holding a seed can replay
 * it against guessed answers until the seating matches. The seed is therefore
 * drawn here, used once and never stored or accepted from a client.
 */
function drawEngineSeed(): number {
	return randomInt(0, ENGINE_SEED_RANGE);
}

function assertNoClientSeed(req: TablesComputePreviewRequest): void {
	if ((req as { seed?: unknown }).seed !== undefined) {
		throw new TablesError('invalid-argument', 'seed is not accepted');
	}
}

function assertComputable(session: TableAssignment): void {
	if (session.status === 'draft' || session.status === 'ended') {
		throw new TablesError(
			'failed-precondition',
			`Cannot compute while the session is ${session.status}`,
		);
	}
}

/** Previews already counted on this budget; refuses when it is spent. */
function spendablePreviews(budget: DocumentSnapshot, limit: number): number {
	const computed = (budget.data() as PreviewBudgetDoc | undefined)?.computed ?? 0;
	if (computed >= limit) {
		throw new TablesError('failed-precondition', 'The preview limit is reached', 'preview-limit');
	}

	return computed;
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
 *
 * Every preview shows the host one more seating and one more set of closeness
 * pills, so both are rationed: at least MIN_REGISTRANTS_FOR_PREVIEW people,
 * MAX_PREVIEWS_PER_ANSWERS previews over one set of registrations and answers,
 * and MAX_PREVIEWS_PER_SESSION in all.
 */
export async function computePreview(
	firestore: Firestore,
	uid: string,
	req: TablesComputePreviewRequest,
	now: number = Date.now(),
	drawSeed: () => number = drawEngineSeed,
): Promise<TablesComputePreviewResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	assertNoClientSeed(req);

	const sessionSnap = await sessionRef(firestore, sessionId).get();
	if (!sessionSnap.exists) throw new TablesError('not-found', 'Session not found');
	const session = sessionSnap.data() as TableAssignment;
	assertHost(session, uid);
	if (session.mode !== 'ranked') {
		throw new TablesError('failed-precondition', 'Only ranked sessions are computed');
	}
	assertComputable(session);

	const { topics, participants, inputHash, answersHash } = await loadRunInputs(
		firestore,
		(q) => q.get(),
		session,
	);
	if (participants.length < MIN_REGISTRANTS_FOR_PREVIEW) {
		throw new TablesError(
			'failed-precondition',
			`At least ${MIN_REGISTRANTS_FOR_PREVIEW} people must register before computing`,
			'too-few-registrants',
		);
	}
	const answersBudgetRef = previewBudgetRef(firestore, sessionId, answersHash);
	const sessionBudgetRef = sessionPreviewBudgetRef(firestore, sessionId);
	// A spent budget is refused before the engine runs; the transaction below has the final say.
	spendablePreviews(await answersBudgetRef.get(), MAX_PREVIEWS_PER_ANSWERS);
	spendablePreviews(await sessionBudgetRef.get(), MAX_PREVIEWS_PER_SESSION);

	// By uid, so the same seed gives the same seating whatever order the query returned.
	const engineParticipants: Participant[] = [...participants]
		.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
		.map((p) => ({
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
			seed: drawSeed(),
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
		status: 'ready',
		...coarseRunFields(assignment),
		inputHash: '',
		createdAt: now,
	};

	// One transaction: the ready runs are read inside it, so a run the host
	// published a moment ago is no longer 'ready' here and is never overwritten.
	await firestore.runTransaction(async (tx) => {
		// Read again here: a session ended or deleted meanwhile must not get a new run.
		assertComputable(await readSession(tx, firestore, sessionId));
		const [older, answersBudget, sessionBudget] = await Promise.all([
			tx.get(readyRunsQuery(firestore, sessionId)),
			tx.get(answersBudgetRef),
			tx.get(sessionBudgetRef),
		]);
		const forAnswers = spendablePreviews(answersBudget, MAX_PREVIEWS_PER_ANSWERS);
		const forSession = spendablePreviews(sessionBudget, MAX_PREVIEWS_PER_SESSION);
		older.docs.forEach((d) => {
			if ((d.data() as TableAssignmentRun).status === 'ready') {
				tx.update(d.ref, { status: 'superseded' });
			}
		});
		tx.set(runRef(firestore, runId), run);
		tx.set(runInputRef(firestore, runId), { sessionId, inputHash });
		const spentOnAnswers: PreviewBudgetDoc = { sessionId, computed: forAnswers + 1 };
		const spentOnSession: PreviewBudgetDoc = { sessionId, computed: forSession + 1 };
		tx.set(answersBudgetRef, spentOnAnswers);
		tx.set(sessionBudgetRef, spentOnSession);
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
