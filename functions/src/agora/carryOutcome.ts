/**
 * What every question item — an open question or a WizCol round — shares
 * when it closes: reading an answer row off its statement doc, and writing
 * the outcome onto the statement tree and the session. Kept apart from the
 * two closers so neither has to import the other.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCarriedAnswer,
	AgoraStagePlanItem,
	AgoraStageOutcome,
	Statement,
	statementToSimpleStatement,
} from '@freedi/shared-types';

/** An answer row as the closing reads it off the statement doc */
export function toCarriedAnswer(statement: Statement, named: boolean): AgoraCarriedAnswer {
	const raters = Number(statement.evaluation?.numberOfEvaluators ?? 0);
	const mean = raters > 0 ? Number(statement.evaluation?.averageEvaluation ?? 0) : 0;
	const consensus = Number(statement.consensus ?? Number.NaN);

	return {
		statementId: statement.statementId,
		statement: statement.statement,
		mean: Number.isFinite(mean) ? mean : 0,
		...(raters > 0 && Number.isFinite(consensus) ? { consensus } : {}),
		raters,
		...(named && statement.anonName ? { anonName: statement.anonName } : {}),
	};
}

/**
 * Stamp a closed carry stage's record: `isChosen` on every answer (the
 * selected ones true), `results` on the question Statement so the main app
 * reads the same choice off the statement tree, and the outcome onto
 * `stageState[itemId]` by field path. One batch, and the same batch for a
 * question and for a round — the two must never stamp differently.
 */
export async function writeOutcome(params: {
	sessionId: string;
	item: AgoraStagePlanItem;
	answers: readonly Statement[];
	outcome: AgoraStageOutcome;
}): Promise<void> {
	const { sessionId, item, answers, outcome } = params;
	if (!item.statementId) return;
	const questionId = item.statementId;
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
	const batch = db.batch();
	const chosen = new Set(outcome.selected.map((row) => row.statementId));
	answers.forEach((statement) => {
		batch.update(db.collection(Collections.statements).doc(statement.statementId), {
			isChosen: chosen.has(statement.statementId),
		});
	});
	batch.update(db.collection(Collections.statements).doc(questionId), {
		results: answers
			.filter((statement) => chosen.has(statement.statementId))
			.map((statement) => statementToSimpleStatement(statement)),
		lastUpdate: Date.now(),
	});
	batch.update(sessionRef, new FieldPath('stageState', item.itemId, 'outcome'), outcome);
	await batch.commit();
}
