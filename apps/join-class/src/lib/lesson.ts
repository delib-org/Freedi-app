import {
	ClassRole,
	Collections,
	LessonStepKey,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import {
	db,
	doc,
	getDoc,
	getDocs,
	collection,
	query,
	where,
	runTransaction,
	writeBatch,
} from './firebase';
import { t } from './i18n';
import {
	getMainStatement,
	setMainStatementSetting,
	setPowerFollowMe,
	setQuestionSetting,
} from './store';
import {
	CLASS_CODES_COLLECTION,
	LESSON_STEP_KEYS,
	LessonStep,
	buildLessonPlan,
	generateClassCode,
	isValidStepIndex,
	lessonStepOf,
	nextStep as nextStepKey,
	normalizeHint,
	planChallengeWrites,
	stepFollowMePath,
	stepLabelKey,
} from './lessonCore';

/**
 * Lesson model on Join's objects (join-class). The lesson IS the workspace
 * (main statement):
 *   statementSettings.lessonPlan = { steps, stepIndex }   current step
 *   statementSettings.classCode  = '123456'                join code
 *   sub-question statementSettings.classRole = 'guiding' | 'challenge'
 *   sub-question statementSettings.hint      = one line shown under it
 * Pure helpers (and the step -> follow-me path mapping) live in lessonCore.ts.
 */

export {
	LESSON_STEP_KEYS,
	CLASS_CODE_LENGTH,
	HINT_MAX_LENGTH,
	isLessonStepKey,
	normalizeClassCode,
	normalizeHint,
	generateClassCode,
	getClassRole,
	getGuidingQuestions,
	getChallengeQuestion,
	stepFollowMePath,
	lessonStepOf,
} from './lessonCore';
export type { LessonStep } from './lessonCore';

/** Transaction attempts before giving up on finding a free class code. */
export const CLASS_CODE_MAX_ATTEMPTS = 8;

/** Translated label of a step ("Opening" / "פתיחה"). */
export function stepLabel(key: LessonStepKey): string {
	return t(stepLabelKey(key));
}

/** The step after `key`, or null at the last one. */
export function nextStep(key: LessonStepKey): LessonStepKey | null {
	return nextStepKey(key);
}

/** Current step of the subscribed workspace (first step if no plan yet). */
export function getLessonStep(): LessonStep {
	return lessonStepOf(getMainStatement()?.statementSettings?.lessonPlan);
}

/**
 * Teacher jumps to a step (forward or back): writes `stepIndex`, then the
 * step's follow-me path so every student device follows. Throws on a bad index.
 */
export async function setLessonStep(mainId: string, index: number): Promise<void> {
	if (!isValidStepIndex(index)) {
		throw new RangeError(`Invalid lesson step index: ${String(index)}`);
	}
	await setMainStatementSetting(mainId, {
		statementSettings: { lessonPlan: buildLessonPlan(index) },
	});
	await setPowerFollowMe(mainId, stepFollowMePath(mainId, LESSON_STEP_KEYS[index]));
}

/** Set one sub-question's role. Prefer `setChallengeQuestion` for the challenge. */
export function setClassRole(questionId: string, role: ClassRole): Promise<void> {
	return setQuestionSetting(questionId, { statementSettings: { classRole: role } });
}

/** Set (or clear, with an empty string) a sub-question's one-line hint. */
export function setQuestionHint(questionId: string, hint: string): Promise<void> {
	return setQuestionSetting(questionId, { statementSettings: { hint: normalizeHint(hint) } });
}

/**
 * Mark one sub-question as the lesson's single challenge; any previous
 * challenge becomes guiding. One batch, so there is never zero or two.
 */
export async function setChallengeQuestion(mainId: string, questionId: string): Promise<void> {
	const snap = await getDocs(
		query(
			collection(db, Collections.statements),
			where('parentId', '==', mainId),
			where('statementType', '==', StatementType.question),
		),
	);
	const questions = snap.docs.map((d) => d.data() as Statement);
	const batch = writeBatch(db);
	const now = Date.now();
	for (const w of planChallengeWrites(questions, questionId)) {
		batch.set(
			doc(db, Collections.statements, w.questionId),
			{ statementSettings: { classRole: w.role }, lastUpdate: now },
			{ merge: true },
		);
	}
	await batch.commit();
}

/**
 * The workspace's six-digit join code, created on first call. Idempotent: the
 * code lives on the workspace (`statementSettings.classCode`, so teacher
 * screens read it from the subscribed statement without a query) and in
 * `classCodes/{code}` (for `/c/:code`). Generation retries inside a
 * transaction when the code is taken by another workspace.
 */
export async function ensureClassCode(mainId: string): Promise<string> {
	const mainRef = doc(db, Collections.statements, mainId);
	for (let attempt = 0; attempt < CLASS_CODE_MAX_ATTEMPTS; attempt++) {
		const candidate = generateClassCode();
		const code = await runTransaction(db, async (tx) => {
			const mainSnap = await tx.get(mainRef);
			const existing = (mainSnap.data() as Statement | undefined)?.statementSettings?.classCode;
			if (existing) return existing;
			const codeRef = doc(db, CLASS_CODES_COLLECTION, candidate);
			if ((await tx.get(codeRef)).exists()) return null;
			const now = Date.now();
			tx.set(codeRef, { mainId, createdAt: now });
			tx.set(
				mainRef,
				{ statementSettings: { classCode: candidate }, lastUpdate: now },
				{ merge: true },
			);

			return candidate;
		});
		if (code) return code;
	}
	throw new Error(`No free class code after ${CLASS_CODE_MAX_ATTEMPTS} attempts`);
}

/** The workspace a code points at, or null for an unknown code. */
export async function resolveClassCode(code: string): Promise<string | null> {
	const snap = await getDoc(doc(db, CLASS_CODES_COLLECTION, code));
	const mainId = snap.exists() ? (snap.data() as { mainId?: string }).mainId : undefined;

	return mainId ?? null;
}
