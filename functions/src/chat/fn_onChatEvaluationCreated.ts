/**
 * Votes share the unified recompute (§4.4). When an evaluation is written on a
 * chat statement, re-run `recomputeAncestors` so an option's C and its ancestor
 * question's aggregates update — the same routine evidence verdicts trigger.
 * Isolated from the main `newEvaluation` path (guarded on `sourceApp === chat`).
 *
 * Triggered on `onDocumentWritten` (create / update / delete) — not just create
 * — because changing a vote (`set` overwrite = update) or retracting it
 * (`delete`) must also recompute. A create-only trigger left the denormalized
 * stats stale after the first vote, so re-votes and retractions "did nothing".
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { Change, DocumentSnapshot, FirestoreEvent } from 'firebase-functions/v2/firestore';
import { Collections, SourceApp } from '@freedi/shared-types';
import type { Statement, Evaluation } from '@freedi/shared-types';
import { recomputeAncestors } from './recomputeAncestors';

export async function onChatEvaluationCreated(
	event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { evaluationId: string }>,
): Promise<void> {
	// On create `before` is empty; on delete `after` is empty — read whichever
	// side exists to find the option the vote belongs to.
	const after = event.data?.after?.data() as Evaluation | undefined;
	const before = event.data?.before?.data() as Evaluation | undefined;
	const statementId = after?.statementId ?? before?.statementId;
	if (!statementId) return;

	const db = getFirestore();
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	const statement = snap.data() as Statement | undefined;
	if (!statement || statement.sourceApp !== SourceApp.CHAT) return;

	await recomputeAncestors(statementId);
}
