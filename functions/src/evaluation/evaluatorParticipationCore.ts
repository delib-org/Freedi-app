/**
 * Db-free helpers for the per-question evaluator count (no import of the
 * functions entry point, so scripts and migrations can use them standalone).
 */

import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementEvaluation,
	getEvaluationParticipantId,
} from '@freedi/shared-types';

/** Firestore batch limit / query page size for the scans below. */
export const PARTICIPANT_PAGE_SIZE = 500;

/** A full StatementEvaluation for a question that has none yet (kept valid for strict parsers). */
export function buildEmptyStatementEvaluation(): StatementEvaluation {
	return {
		agreement: 0,
		sumEvaluations: 0,
		numberOfEvaluators: 0,
		sumPro: 0,
		sumCon: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		sumSquaredEvaluations: 0,
		averageEvaluation: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};
}

/**
 * The parent patch for "count is now `count`" (absolute number) or "+1"
 * (FieldValue.increment). Always stamps `lastUpdate`: callers write it only
 * when the count really changes.
 */
export function buildCounterPatch(
	parent: Statement,
	count: number | FieldValue,
): Record<string, unknown> {
	// `lastUpdate` moves with a real count change so delta listeners
	// (`where lastUpdate > watermark`, the only live channel for bulk-loaded
	// scopes) deliver the new count.
	const lastUpdate = Date.now();

	if (parent.evaluation) {
		return { 'evaluation.asParentTotalEvaluators': count, totalEvaluators: count, lastUpdate };
	}

	// No evaluation map yet: create a complete one so strict parsers still accept it.
	const asNumber = typeof count === 'number' ? count : 1;

	return {
		evaluation: { ...buildEmptyStatementEvaluation(), asParentTotalEvaluators: asNumber },
		totalEvaluators: count,
		lastUpdate,
	};
}

export function participantRef(
	firestore: Firestore,
	parentId: string,
	userId: string,
): DocumentReference {
	return firestore
		.collection(Collections.evaluationParticipants)
		.doc(getEvaluationParticipantId(parentId, userId));
}

/**
 * Sets a question's counters to the number of its markers, atomically: the
 * marker count and the question are read inside one transaction, so a
 * concurrent first evaluation (which writes the question) cannot be
 * overwritten with a stale count. Writes only if the stored count differs.
 */
export async function syncCountFromMarkers(
	firestore: Firestore,
	parentId: string,
): Promise<{ count: number; changed: boolean }> {
	const parentRef = firestore.collection(Collections.statements).doc(parentId);
	const markers = firestore
		.collection(Collections.evaluationParticipants)
		.where('parentId', '==', parentId);

	return firestore.runTransaction(async (transaction) => {
		const parentDoc = await transaction.get(parentRef);
		const countSnapshot = await transaction.get(markers.count());
		const count = countSnapshot.data().count;
		if (!parentDoc.exists) return { count, changed: false };
		const parent = parentDoc.data() as Statement;

		const inSync =
			parent.evaluation?.asParentTotalEvaluators === count && parent.totalEvaluators === count;
		if (inSync) return { count, changed: false };
		transaction.update(parentRef, buildCounterPatch(parent, count));

		return { count, changed: true };
	});
}
