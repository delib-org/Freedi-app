import { SIDE_CLAIM_MAX_LENGTH, SIDE_QUESTION_MAX_LENGTH } from '@/lib/classroom/classSettings';
import { getPlanMain } from './planSource';
import { dropDraft, getDraft, getMainId, runSave, setDraft } from './planController';
import { saveLessonDetails, saveLessonLanguage } from './planApi';

/** The "lesson details" fields of the plan screen: the lesson language, the
 *  side question and, per side, what it says. Saved on blur like the other plan fields. (The video
 *  link moved to the "הקדמה" section, planIntroController.ts.) */

export const LANGUAGE_KEY = 'lesson:language';
export const SIDE_QUESTION_KEY = 'lesson:sideQuestion';
export const CLAIM_A_KEY = 'lesson:claimA';
export const CLAIM_B_KEY = 'lesson:claimB';

export function onDetailInput(key: string, value: string, max: number): void {
	setDraft(key, value.slice(0, max));
}

/** The saved side question; empty when the lesson uses the translated default. */
export function savedSideQuestion(): string {
	return getPlanMain()?.statementSettings?.sideQuestion ?? '';
}

export function commitSideQuestion(): void {
	const draft = getDraft(SIDE_QUESTION_KEY);
	if (draft === undefined) return;
	const question = draft.trim().slice(0, SIDE_QUESTION_MAX_LENGTH);
	if (question === savedSideQuestion()) {
		dropDraft(SIDE_QUESTION_KEY);

		return;
	}
	setDraft(SIDE_QUESTION_KEY, question);
	runSave(SIDE_QUESTION_KEY, 'save side question', () =>
		saveLessonDetails(getMainId(), { sideQuestion: question }),
	);
}

/** What is saved for a side's claim; empty = no claim line. */
export function savedSideClaim(key: string): string {
	const own = getPlanMain()?.statementSettings?.sideClaims;

	return (key === CLAIM_A_KEY ? own?.a : own?.b) ?? '';
}

export function commitSideClaim(key: string): void {
	const draft = getDraft(key);
	if (draft === undefined) return;
	const claim = draft.trim().slice(0, SIDE_CLAIM_MAX_LENGTH);
	if (claim === savedSideClaim(key)) {
		dropDraft(key);

		return;
	}
	setDraft(key, claim);
	// both claims travel together as one object
	const other = key === CLAIM_A_KEY ? CLAIM_B_KEY : CLAIM_A_KEY;
	const otherClaim = (getDraft(other) ?? savedSideClaim(other))
		.trim()
		.slice(0, SIDE_CLAIM_MAX_LENGTH);
	const sideClaims =
		key === CLAIM_A_KEY ? { a: claim, b: otherClaim } : { a: otherClaim, b: claim };
	runSave(key, 'save side claim', () => saveLessonDetails(getMainId(), { sideClaims }));
}

/** The lesson language that students follow; empty = unset (each student's own device language). */
export function savedLessonLanguage(): string {
	const main = getPlanMain();

	return main?.forceLanguage === true && main.defaultLanguage ? main.defaultLanguage : '';
}

/** Saved on change (a select has no blur to wait for), through the same save path as the other fields. */
export function commitLanguage(value: string): void {
	if (value === savedLessonLanguage()) {
		dropDraft(LANGUAGE_KEY);

		return;
	}
	setDraft(LANGUAGE_KEY, value);
	runSave(LANGUAGE_KEY, 'save lesson language', () =>
		saveLessonLanguage(getMainId(), value === '' ? null : value),
	);
}
