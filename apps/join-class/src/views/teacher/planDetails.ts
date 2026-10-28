import {
	SIDE_CLAIM_MAX_LENGTH,
	SIDE_NAME_MAX_LENGTH,
	SIDE_QUESTION_MAX_LENGTH,
	sideNamesOf,
} from '@/lib/classroom/classSettings';
import { getMainStatement, setStatementLanguage } from '@/lib/store';
import { dropDraft, getDraft, getMainId, runSave, setDraft } from './planController';
import { saveLessonDetails } from './planApi';

/** The "lesson details" fields of the plan screen: the lesson language, the
 *  side question and, per side, its character name and claim. Saved on blur like the other plan fields. (The video
 *  link moved to the "הקדמה" section, planIntroController.ts.) */

export const SIDE_A_KEY = 'lesson:sideA';
export const SIDE_B_KEY = 'lesson:sideB';
export const LANGUAGE_KEY = 'lesson:language';
export const SIDE_QUESTION_KEY = 'lesson:sideQuestion';
export const CLAIM_A_KEY = 'lesson:claimA';
export const CLAIM_B_KEY = 'lesson:claimB';

/** What is saved for a name; empty when the lesson uses the translated default. */
export function savedSideName(key: string): string {
	const own = getMainStatement()?.statementSettings?.sideNames;

	return (key === SIDE_A_KEY ? own?.a : own?.b) ?? '';
}

export function onDetailInput(key: string, value: string, max: number): void {
	setDraft(key, value.slice(0, max));
}

export function commitSideName(key: string): void {
	const draft = getDraft(key);
	if (draft === undefined) return;
	const name = draft.trim().slice(0, SIDE_NAME_MAX_LENGTH);
	if (name === savedSideName(key)) {
		dropDraft(key);

		return;
	}
	setDraft(key, name);
	// both names travel together (the schema keeps them as one object); the
	// other one keeps whatever is typed or saved, empty meaning "use the default"
	const other = key === SIDE_A_KEY ? SIDE_B_KEY : SIDE_A_KEY;
	const otherName = (getDraft(other) ?? savedSideName(other)).trim().slice(0, SIDE_NAME_MAX_LENGTH);
	const sideNames = key === SIDE_A_KEY ? { a: name, b: otherName } : { a: otherName, b: name };
	runSave(key, 'save side name', () => saveLessonDetails(getMainId(), { sideNames }));
}

/** The saved side question; empty when the lesson uses the translated default. */
export function savedSideQuestion(): string {
	return getMainStatement()?.statementSettings?.sideQuestion ?? '';
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

/** What is saved for a side's claim; empty = no claim line under the name. */
export function savedSideClaim(key: string): string {
	const own = getMainStatement()?.statementSettings?.sideClaims;

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
	// like the names, both claims travel together as one object
	const other = key === CLAIM_A_KEY ? CLAIM_B_KEY : CLAIM_A_KEY;
	const otherClaim = (getDraft(other) ?? savedSideClaim(other))
		.trim()
		.slice(0, SIDE_CLAIM_MAX_LENGTH);
	const sideClaims =
		key === CLAIM_A_KEY ? { a: claim, b: otherClaim } : { a: otherClaim, b: claim };
	runSave(key, 'save side claim', () => saveLessonDetails(getMainId(), { sideClaims }));
}

/** Placeholder of a name field: the translated default the class will see. */
export function defaultSideName(key: string): string {
	const names = sideNamesOf(null);

	return key === SIDE_A_KEY ? names.a : names.b;
}

/** The lesson language that students follow; empty = unset (each student's own device language). */
export function savedLessonLanguage(): string {
	const main = getMainStatement();

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
		setStatementLanguage(getMainId(), value === '' ? null : value),
	);
}
