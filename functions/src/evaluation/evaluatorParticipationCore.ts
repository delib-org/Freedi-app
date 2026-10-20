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
 * (FieldValue.increment). Never touches `lastUpdate`.
 */
export function buildCounterPatch(
	parent: Statement,
	count: number | FieldValue,
): Record<string, unknown> {
	if (parent.evaluation) {
		return { 'evaluation.asParentTotalEvaluators': count, totalEvaluators: count };
	}

	// No evaluation map yet: create a complete one so strict parsers still accept it.
	const asNumber = typeof count === 'number' ? count : 1;

	return {
		evaluation: { ...buildEmptyStatementEvaluation(), asParentTotalEvaluators: asNumber },
		totalEvaluators: count,
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
