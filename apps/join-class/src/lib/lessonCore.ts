import {
	ClassRole,
	LessonPlan,
	LessonStatus,
	LessonStepKey,
	Statement,
	lessonStatusOf,
} from '@freedi/shared-types';

/**
 * Pure lesson-model helpers (no Firestore, no DOM): step order, follow-me
 * paths, class-role ordering and join-code format. `lesson.ts` wraps these
 * with the writes. Docs: docs/ia/agora-classroom.md section 2.3 and 11.
 */

/**
 * The steps of a NEW lesson, in the order the teacher opens them (9 since
 * "כל ההצעות", IA 19). A lesson keeps the list it was created with in
 * `lessonPlan.steps`: read the current lesson's steps with `planStepKeys`,
 * never index this list with a stored `stepIndex`.
 */
export const LESSON_STEP_KEYS: readonly LessonStepKey[] = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'allProposals',
	'vote',
	'summary',
];

export const FIRST_LESSON_STEP_INDEX = 0;

/** Join code: six digits, typed by 12-15 year olds on a phone. */
export const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_RADIX = 10;
const CLASS_CODE_PATTERN = new RegExp(`^\\d{${CLASS_CODE_LENGTH}}$`);

/** Firestore collection holding `classCodes/{code} -> { mainId, createdAt }`. */
export const CLASS_CODES_COLLECTION = 'classCodes';

export const CLASS_ROLE_GUIDING: ClassRole = 'guiding';
export const CLASS_ROLE_CHALLENGE: ClassRole = 'challenge';

export interface LessonStep {
	index: number;
	key: LessonStepKey;
}

export function isLessonStepKey(value: unknown): value is LessonStepKey {
	return typeof value === 'string' && (LESSON_STEP_KEYS as readonly string[]).includes(value);
}

/**
 * The ordered steps of a stored plan. A lesson created before "כל ההצעות" keeps
 * its 8 stored steps (an old lesson sitting at Vote, index 6, must not jump to
 * the new step); a plan with no usable list gets the current one.
 */
export function planStepKeys(
	plan: Pick<LessonPlan, 'steps'> | undefined | null,
): readonly LessonStepKey[] {
	const steps = plan?.steps;

	return Array.isArray(steps) && steps.length > 0 && steps.every(isLessonStepKey)
		? steps
		: LESSON_STEP_KEYS;
}

export function isValidStepIndex(
	index: unknown,
	steps: readonly LessonStepKey[] = LESSON_STEP_KEYS,
): index is number {
	return (
		typeof index === 'number' &&
		Number.isInteger(index) &&
		index >= FIRST_LESSON_STEP_INDEX &&
		index < steps.length
	);
}

/** The step after `key` in `steps`, or null at the last step (summary). */
export function nextStep(
	key: LessonStepKey,
	steps: readonly LessonStepKey[] = LESSON_STEP_KEYS,
): LessonStepKey | null {
	const next = steps.indexOf(key) + 1;

	return next > 0 && next < steps.length ? steps[next] : null;
}

/** i18n key of a step's label (`step.<key>`); `stepLabel` in lesson.ts translates it. */
export function stepLabelKey(key: LessonStepKey): string {
	return `step.${key}`;
}

/**
 * Follow-me path of a step.
 *
 * Choice: every step is the workspace hub (`/statement/{mainId}`, which Join's
 * follow-me maps to `/m/:mid`) and the step is carried by a `?step=<key>` query.
 * Join's follow-me redirect only understands three targets (hub, question,
 * chat) and strips the query when mapping, so participants land on `/m/:mid`,
 * where the student screens read `lessonPlan.stepIndex` to decide what to
 * show. The query makes the path differ per step, so every jump (forward or
 * back) counts as a changed broadcast and re-gathers a participant who drifted
 * off, even in free-navigation rooms. Screens are keyed by step index, never
 * by route, so later lanes add no routes for steps.
 */
export function stepFollowMePath(mainId: string, key: LessonStepKey): string {
	return `/statement/${mainId}?step=${key}`;
}

/**
 * The current step of a lesson plan, read from the plan's OWN steps
 * (`steps[stepIndex]`); a workspace with no plan sits at the first step.
 */
export function lessonStepOf(plan: LessonPlan | undefined): LessonStep {
	const steps = planStepKeys(plan);
	const index =
		plan && isValidStepIndex(plan.stepIndex, steps) ? plan.stepIndex : FIRST_LESSON_STEP_INDEX;

	return { index, key: steps[index] };
}

/** A plan at `stepIndex` of `steps` (default: a new lesson's steps). */
export function buildLessonPlan(
	stepIndex: number,
	steps: readonly LessonStepKey[] = LESSON_STEP_KEYS,
): LessonPlan {
	return { steps: [...steps], stepIndex };
}

/** A new lesson's plan: step 0 (Waiting), live, so `/m/:mid` is a lesson from its first second. */
export function buildNewLessonPlan(now: number): LessonPlan {
	return { ...buildLessonPlan(FIRST_LESSON_STEP_INDEX), status: 'live', statusAt: now };
}

/** The lesson's status from its main statement; no plan or no status means live. */
export function lessonStatusOfMain(main: Statement | null | undefined): LessonStatus {
	return lessonStatusOf(main?.statementSettings?.lessonPlan);
}

/** Paused and ended lessons stand still: no step moves, no table moves, no writing. */
export function isLessonStanding(status: LessonStatus): boolean {
	return status === 'paused' || status === 'ended';
}

/**
 * What a step move writes. An `open` lesson (kept open after class) returns to
 * `live` the moment the teacher moves a step (IA 13.6); other statuses are
 * left to the status callable.
 */
export function planStepMove(
	stepIndex: number,
	status: LessonStatus,
	now: number,
	steps: readonly LessonStepKey[] = LESSON_STEP_KEYS,
): LessonPlan {
	// A move keeps the lesson's stored steps (an old 8-step lesson stays 8-step), and
	// always puts the projector back on the introduction text (IA 14.2).
	const plan: LessonPlan = { ...buildLessonPlan(stepIndex, steps), projectorVideoId: null };

	return status === 'open' ? { ...plan, status: 'live', statusAt: now } : plan;
}

export function getClassRole(question: Statement): ClassRole {
	return question.statementSettings?.classRole === CLASS_ROLE_CHALLENGE
		? CLASS_ROLE_CHALLENGE
		: CLASS_ROLE_GUIDING;
}

/** Join's manual order: explicit `order`, then creation time. */
export function compareByManualOrder(a: Statement, b: Statement): number {
	const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
	const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
	if (ao !== bo) return ao - bo;

	return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/** The lesson's challenge question, or null when the teacher has not marked one. */
export function getChallengeQuestion(questions: readonly Statement[]): Statement | null {
	const challenges = questions.filter((q) => getClassRole(q) === CLASS_ROLE_CHALLENGE);

	return challenges.length > 0 ? [...challenges].sort(compareByManualOrder)[0] : null;
}

/** Every question that is not the challenge, in Join's manual order. */
export function getGuidingQuestions(questions: readonly Statement[]): Statement[] {
	return questions.filter((q) => getClassRole(q) === CLASS_ROLE_GUIDING).sort(compareByManualOrder);
}

export interface ClassRoleWrite {
	questionId: string;
	role: ClassRole;
}

/**
 * Writes that make `challengeId` the one challenge: it is promoted, and every
 * other question currently marked challenge is demoted to guiding.
 */
export function planChallengeWrites(
	questions: readonly Statement[],
	challengeId: string,
): ClassRoleWrite[] {
	const writes: ClassRoleWrite[] = [{ questionId: challengeId, role: CLASS_ROLE_CHALLENGE }];
	for (const q of questions) {
		if (q.statementId !== challengeId && getClassRole(q) === CLASS_ROLE_CHALLENGE) {
			writes.push({ questionId: q.statementId, role: CLASS_ROLE_GUIDING });
		}
	}

	return writes;
}

/** A random six-digit code (leading zeros allowed). `random` returns [0, 1). */
export function generateClassCode(random: () => number = Math.random): string {
	let code = '';
	for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
		code += Math.floor(random() * CLASS_CODE_RADIX).toString();
	}

	return code;
}

/** Strip spaces and dashes a student may type ("123 456"); returns null if not six digits. */
export function normalizeClassCode(input: string): string | null {
	const digits = input.replace(/[\s-]/g, '');

	return CLASS_CODE_PATTERN.test(digits) ? digits : null;
}

/** Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits, which Arabic and Farsi keyboards send. */
const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;
const DIGIT_COUNT = 10;
const JOIN_LINK_CODE = /\/c\/([^/?#\s]+)/;

function toAsciiDigits(input: string): string {
	return Array.from(input, (ch) => {
		const point = ch.codePointAt(0) ?? 0;
		if (point >= ARABIC_INDIC_ZERO && point < ARABIC_INDIC_ZERO + DIGIT_COUNT) {
			return String(point - ARABIC_INDIC_ZERO);
		}
		if (point >= PERSIAN_ZERO && point < PERSIAN_ZERO + DIGIT_COUNT) {
			return String(point - PERSIAN_ZERO);
		}

		return ch;
	}).join('');
}

/**
 * What the front door's one input keeps: digits only (Arabic-Indic and Persian
 * digits mapped to 0-9), at most six. A pasted join link ("https://host/c/482913")
 * yields its code; "482 913" and "482-913" yield 482913.
 */
export function toCodeDigits(input: string): string {
	const link = JOIN_LINK_CODE.exec(input);
	const source = link ? link[1] : input;

	return toAsciiDigits(source).replace(/\D/g, '').slice(0, CLASS_CODE_LENGTH);
}

/** Longest hint, in characters: one line on a phone. */
export const HINT_MAX_LENGTH = 90;

/** Trim a hint to one line of at most HINT_MAX_LENGTH characters. */
export function normalizeHint(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().slice(0, HINT_MAX_LENGTH);
}
