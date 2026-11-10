/**
 * Brings the question document's copies of its counters up to the exact
 * numbers, for questions that changed recently.
 *
 * The triggers copy a count only when it enters a new bucket, so a question
 * that goes quiet at 97 raters would show 95 for good. This scheduled pass
 * closes that gap at most once per run per question. It also recounts members,
 * which heals the case where two join or leave triggers recounted at once and
 * the older number landed last.
 *
 * Progress docs also exist for answers (the parent of a chat reply), and on an
 * answer `totalEvaluators` is its own rater count, not a copy of anything, so
 * each counter is handled only for the statement types that keep it. The rater
 * copy is never lowered here: a legacy question can hold a count with no markers
 * behind it, and only `reconcileParentEvaluators` may reduce it.
 *
 * Only questions whose progress doc moved inside the window are read, so a
 * quiet question costs nothing. Nothing here touches `lastUpdate` on the
 * progress doc, or a question would keep itself in the window forever.
 */

import type { QueryDocumentSnapshot, DocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import type { QuestionProgress, Statement } from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { buildCounterPatch } from '../evaluation/evaluatorParticipationCore';
import { countMembers, keepsCountOnProgress } from './questionProgressWriter';

/** Two run intervals, so one failed run does not lose a question. */
export const RECENT_ACTIVITY_WINDOW_MS = 20 * 60 * 1000;
/** Most questions one run looks at; the most recently active come first. */
const SYNC_QUESTION_LIMIT = 500;

async function countEvaluators(statementId: string): Promise<number> {
	const snapshot = await db
		.collection(Collections.evaluationParticipants)
		.where('parentId', '==', statementId)
		.count()
		.get();

	return snapshot.data().count;
}

async function exactMembersPatch(
	progressDoc: QueryDocumentSnapshot,
	statement: Statement,
): Promise<Record<string, unknown>> {
	const stored = (progressDoc.data() as Partial<QuestionProgress>).members;
	if (typeof stored !== 'number' || !keepsCountOnProgress(statement)) return {};

	const members = await countMembers(db, progressDoc.id);
	if (members !== stored) await progressDoc.ref.set({ members }, { merge: true });

	return members === statement.numberOfMembers ? {} : { numberOfMembers: members };
}

/**
 * `evaluated` is the cheap signal: while it equals the copy, the markers are
 * not counted. A plain read and update rather than `syncCountFromMarkers`,
 * whose transaction would lock the document every rater shares.
 */
async function exactEvaluatorsPatch(
	progressDoc: QueryDocumentSnapshot,
	statement: Statement,
): Promise<Record<string, unknown>> {
	if (statement.statementType !== StatementType.question) return {};

	const copied = statement.evaluation?.asParentTotalEvaluators ?? statement.totalEvaluators ?? 0;
	const evaluated = (progressDoc.data() as Partial<QuestionProgress>).evaluated ?? 0;
	if (evaluated === copied) return {};

	const count = await countEvaluators(progressDoc.id);

	return count > copied ? buildCounterPatch(statement, count) : {};
}

async function syncOne(
	progressDoc: QueryDocumentSnapshot,
	statementDoc: DocumentSnapshot,
): Promise<boolean> {
	const statement = statementDoc.data() as Statement | undefined;
	if (!statement) return false;

	const patch = {
		...(await exactMembersPatch(progressDoc, statement)),
		...(await exactEvaluatorsPatch(progressDoc, statement)),
	};
	if (Object.keys(patch).length === 0) return false;

	await statementDoc.ref.update({ ...patch, lastUpdate: Date.now() });

	return true;
}

export async function syncQuestionCounterCopies(
	now: number = Date.now(),
): Promise<{ checked: number; updated: number }> {
	const recent = await db
		.collection(Collections.questionProgress)
		.where('lastUpdate', '>', now - RECENT_ACTIVITY_WINDOW_MS)
		.orderBy('lastUpdate', 'desc')
		.limit(SYNC_QUESTION_LIMIT)
		.get();
	if (recent.empty) return { checked: 0, updated: 0 };

	const statements = await db.getAll(
		...recent.docs.map((doc) => db.collection(Collections.statements).doc(doc.id)),
	);

	let updated = 0;
	for (const [index, progressDoc] of recent.docs.entries()) {
		try {
			if (await syncOne(progressDoc, statements[index])) updated += 1;
		} catch (error) {
			// The next run still has this question in its window.
			logError(error, {
				operation: 'progress.syncQuestionCounterCopies',
				statementId: progressDoc.id,
			});
		}
	}

	return { checked: recent.size, updated };
}
