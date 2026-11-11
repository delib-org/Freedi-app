import { Collections, StatementType, type Statement, readScopesOfRoot } from '@freedi/shared-types';
import {
	db,
	doc,
	collection,
	functions,
	getDoc,
	getDocs,
	httpsCallable,
	query,
	where,
	writeBatch,
} from '../firebase';
import { captureException } from '../sentry';
import { RECALCULATE_TIMEOUT_MS, classSizePatch, parseClassSize } from './classSize';

/**
 * Writing the class size (N): on the lesson and on each of its questions, in
 * one batch, then rescoring the questions that already have ratings.
 */

/** Firestore allows 500 writes in a batch; stay under it. */
const BATCH_LIMIT = 450;

/** The save itself did not happen; nothing was recalculated. */
export class ClassSizeSaveError extends Error {
	constructor(readonly original: unknown) {
		super('class size not saved');
		this.name = 'ClassSizeSaveError';
	}
}

/** The number is saved but some question could not be rescored. */
export class ClassSizeRecalcError extends Error {
	constructor(readonly failedQuestionIds: string[]) {
		super('class size saved, scores not recalculated');
		this.name = 'ClassSizeRecalcError';
	}
}

/** The lesson's question ids (its direct children of type question). */
export async function questionIdsOfLesson(mainId: string): Promise<string[]> {
	const snap = await getDocs(
		query(
			collection(db, Collections.statements),
			where('parentId', '==', mainId),
			where('accessScope', 'in', readScopesOfRoot(mainId)),
			where('statementType', '==', StatementType.question),
		),
	);

	return snap.docs.map((d) => (d.data() as Statement).statementId);
}

/** Whether each doc already carries evaluationSettings.evaluationUI (never overwritten). */
async function hasEvaluationUI(id: string): Promise<boolean> {
	const snap = await getDoc(doc(db, Collections.statements, id));

	return Boolean((snap.data() as Statement | undefined)?.evaluationSettings?.evaluationUI);
}

/** Merge N onto the lesson and each question. All-or-nothing per batch. */
export async function writeClassSize(
	mainId: string,
	questionIds: readonly string[],
	size: number,
): Promise<void> {
	const ids = [mainId, ...questionIds];
	const withUi = await Promise.all(ids.map(hasEvaluationUI));
	const now = Date.now();
	for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
		const batch = writeBatch(db);
		ids.slice(i, i + BATCH_LIMIT).forEach((id, offset) => {
			batch.set(
				doc(db, Collections.statements, id),
				{ ...classSizePatch(size, withUi[i + offset]), lastUpdate: now },
				{ merge: true },
			);
		});
		await batch.commit();
	}
}

/** Questions with at least one rated option (options have the question as parent). */
export async function questionsWithRatings(questionIds: readonly string[]): Promise<string[]> {
	const rated: string[] = [];
	for (const questionId of questionIds) {
		const snap = await getDocs(
			query(
				collection(db, Collections.statements),
				where('parentId', '==', questionId),
				where('statementType', '==', StatementType.option),
			),
		);
		const hasRatings = snap.docs.some(
			(d) => ((d.data() as Statement).evaluation?.numberOfEvaluators ?? 0) > 0,
		);
		if (hasRatings) rated.push(questionId);
	}

	return rated;
}

/** Rescore each question once. A refusal is collected, not thrown, so the rest still run. */
export async function recalculateQuestions(questionIds: readonly string[]): Promise<string[]> {
	const recalculate = httpsCallable<{ statementId: string }, { success: boolean }>(
		functions,
		'recalculateIndices',
		{ timeout: RECALCULATE_TIMEOUT_MS },
	);
	const failed: string[] = [];
	for (const statementId of questionIds) {
		try {
			await recalculate({ statementId });
		} catch (error) {
			failed.push(statementId);
			captureException(error, { operation: 'classSize.recalculate', statementId });
		}
	}

	return failed;
}

/**
 * The teacher's save: parse the input (empty means the default), write it on
 * the lesson and its questions, then rescore the questions with ratings.
 * Throws ClassSizeSaveError or ClassSizeRecalcError; resolves to the saved N.
 */
export async function saveClassSize(
	mainId: string,
	questionIds: readonly string[],
	raw: unknown,
): Promise<number> {
	const size = parseClassSize(raw);
	try {
		await writeClassSize(mainId, questionIds, size);
	} catch (error) {
		captureException(error, { operation: 'classSize.write', mainId });
		throw new ClassSizeSaveError(error);
	}
	let rated: string[];
	try {
		rated = await questionsWithRatings(questionIds);
	} catch (error) {
		captureException(error, { operation: 'classSize.findRated', mainId });
		throw new ClassSizeRecalcError([...questionIds]);
	}
	const failed = await recalculateQuestions(rated);
	if (failed.length > 0) throw new ClassSizeRecalcError(failed);

	return size;
}

/** A new lesson has no ratings yet: write N on it and its questions, no rescoring. */
export async function writeClassSizeOnNewLesson(mainId: string, raw: unknown): Promise<number> {
	const size = parseClassSize(raw);
	try {
		await writeClassSize(mainId, await questionIdsOfLesson(mainId), size);
	} catch (error) {
		captureException(error, { operation: 'classSize.writeNewLesson', mainId });
		throw new ClassSizeSaveError(error);
	}

	return size;
}
