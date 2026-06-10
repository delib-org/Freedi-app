/**
 * Votes share the unified recompute (§4.4). When an evaluation is written on a
 * chat statement, re-run `recomputeAncestors` so an option's C and its ancestor
 * question's aggregates update — the same routine evidence verdicts trigger.
 * Isolated from the main `newEvaluation` path (guarded on `sourceApp === chat`).
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { Collections, SourceApp } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { recomputeAncestors } from './recomputeAncestors';

export async function onChatEvaluationCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { evaluationId: string }>,
): Promise<void> {
	const evaluation = event.data?.data();
	const statementId = evaluation?.statementId;
	if (!statementId) return;

	const db = getFirestore();
	const snap = await db.collection(Collections.statements).doc(statementId).get();
	const statement = snap.data() as Statement | undefined;
	if (!statement || statement.sourceApp !== SourceApp.CHAT) return;

	await recomputeAncestors(statementId);
}
