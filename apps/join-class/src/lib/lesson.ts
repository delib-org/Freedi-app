import {
	ClassRole,
	Collections,
	LessonStepKey,
	Statement,
	StatementType,
	getRandomUID,
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
	getQuestion,
	loadQuestion,
	setMainStatementSetting,
	setPowerFollowMe,
	setQuestionSetting,
} from './store';
import { markOpenedInClass, waitForCreatorSubscription } from './joinSubscriptions';
import { getUserState } from './user';
import { classStartLesson } from './classroom/api';
import {
	CLASS_CODES_COLLECTION,
	LessonStep,
	generateClassCode,
	isLessonStanding,
	isValidStepIndex,
	lessonStatusOfMain,
	lessonStepOf,
	nextStep as nextStepKey,
	normalizeHint,
	planChallengeWrites,
	planStepKeys,
	planStepMove,
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
	planStepKeys,
} from './lessonCore';
export type { LessonStep } from './lessonCore';

/** Transaction attempts before giving up on finding a free class code. */
export const CLASS_CODE_MAX_ATTEMPTS = 8;

/** Translated label of a step ("Opening" / "פתיחה"). */
export function stepLabel(key: LessonStepKey): string {
	return t(stepLabelKey(key));
}

/** The step after `key` in the current lesson's own steps, or null at the last one. */
export function nextStep(key: LessonStepKey): LessonStepKey | null {
	return nextStepKey(key, getLessonSteps());
}

/** The current lesson's own ordered steps (8 for a lesson made before "כל ההצעות", else 9). */
export function getLessonSteps(): readonly LessonStepKey[] {
	return planStepKeys(getMainStatement()?.statementSettings?.lessonPlan);
}

/** Current step of the subscribed workspace (first step if no plan yet). */
export function getLessonStep(): LessonStep {
	return lessonStepOf(getMainStatement()?.statementSettings?.lessonPlan);
}

/**
 * Teacher jumps to a step (forward or back): writes `stepIndex`, then the
 * step's follow-me path so every student device follows. Throws on a bad index,
 * and while the lesson is paused or ended (the rail is held; reopen or resume
 * first). A move on an `open` lesson makes it live again.
 */
export async function setLessonStep(mainId: string, index: number): Promise<void> {
	const steps = getLessonSteps();
	if (!isValidStepIndex(index, steps)) {
		throw new RangeError(`Invalid lesson step index: ${String(index)}`);
	}
	const status = lessonStatusOfMain(getMainStatement());
	if (isLessonStanding(status)) {
		throw new Error(`The lesson is ${status}: steps do not move`);
	}
	await setMainStatementSetting(mainId, {
		statementSettings: { lessonPlan: planStepMove(index, status, Date.now(), steps) },
	});
	await setPowerFollowMe(mainId, stepFollowMePath(mainId, steps[index]));
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

/**
 * `onStatementCreated` (a Cloud Function shared by every app) writes the
 * creator's admin subscription with a plain `set`, which replaces the doc and
 * drops the `openedInClass` marker if the marker was written first. So the
 * marker waits for that subscription (bounded; the function is normally done
 * in a second or two). If it does not show up in time the client writes the
 * subscription itself and writes the marker again later; opening the plan or
 * the console writes it too.
 */
const SUBSCRIPTION_WAIT_MS = 8_000;
const SUBSCRIPTION_POLL_MS = 300;
const REMARK_DELAYS_MS: readonly number[] = [5_000, 15_000];

function remarkLater(statement: Statement): void {
	for (const delay of REMARK_DELAYS_MS) {
		window.setTimeout(() => {
			const user = getUserState().user;
			if (!user) return;
			markOpenedInClass(statement, user.uid, user.displayName ?? '').catch((err: unknown) => {
				console.error('[createLesson] re-marking the lesson failed:', err);
			});
		}, delay);
	}
}

/**
 * What every new lesson goes through once its statement exists: load it, wait
 * for the server's creator subscription, write the `openedInClass` marker that
 * lists it on the teacher's home, then (if the server was slow) mark it again
 * later. `beforeRemark` runs after the marker (createLesson makes its class
 * code there; a copy already has one).
 */
export async function settleNewLesson(
	id: string,
	beforeRemark?: () => Promise<void>,
): Promise<void> {
	const user = getUserState().user;
	await loadQuestion(id);
	const statement = getQuestion();
	let serverSubscription = false;
	if (user) {
		serverSubscription = await waitForCreatorSubscription(
			id,
			user.uid,
			SUBSCRIPTION_WAIT_MS,
			SUBSCRIPTION_POLL_MS,
		);
		if (statement) await markOpenedInClass(statement, user.uid, user.displayName ?? '');
	}
	if (beforeRemark) await beforeRemark();
	if (statement && !serverSubscription) remarkLater(statement);
}

/**
 * "+ שיעור עם כיתה" (docs/ia/join-class-lesson-plan.md 6.4): the server plays a prepared
 * game with a class. It makes the home (`jcClass_{classId}`, or the teacher's own when
 * `classId` is null), builds the lesson from the game's snapshot under it and gives it a
 * class code, all in one transaction; then the same settling as any new lesson (the
 * `openedInClass` marker that lists it). `newMainId` is the id this attempt owns: pass the
 * same one on a retry and the server returns the lesson it already made instead of a
 * second one. Returns the new lesson's id; throws when a step fails (the caller offers a
 * retry with the same id).
 */
export async function startLesson(input: {
	planId: string;
	gameId: string;
	classId: string | null;
	newMainId?: string;
	/** The teacher's name for this lesson; the server falls back to "<game> עם <class>". */
	lessonName?: string;
}): Promise<string> {
	const res = await classStartLesson({
		planId: input.planId,
		gameId: input.gameId,
		classId: input.classId,
		newMainId: input.newMainId ?? getRandomUID(),
		...(input.lessonName ? { lessonName: input.lessonName } : {}),
	});
	await settleNewLesson(res.mainId);

	return res.mainId;
}
