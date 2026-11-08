import { LESSON_NAME_MAX_LENGTH, cleanLessonName } from '@freedi/shared-types';

/**
 * The lesson-name field of "+ שיעור עם כיתה": prefilled "<game> עם <class>" (just "<game>"
 * for "בלי כיתה"), re-filled when the class choice changes until the teacher types, then
 * her text is kept. Pure, so the rules are tested without the form.
 */

export const LESSON_NAME_MAX = LESSON_NAME_MAX_LENGTH;

export interface LessonNameDraft {
	text: string;
	/** True once the teacher typed in the field. */
	edited: boolean;
}

/** Joins the game and the class in the teacher's language (i18n `teacher.lesson.name_default`). */
export type JoinGameAndClass = (game: string, className: string) => string;

/** The suggested name; `className` null or blank = no class. Capped like the stored name. */
export function defaultLessonName(
	gameTitle: string,
	className: string | null,
	join: JoinGameAndClass,
): string {
	const game = gameTitle.trim();
	const cls = (className ?? '').trim();

	return cleanLessonName(cls ? join(game, cls) : game);
}

export function freshDraft(suggestion: string): LessonNameDraft {
	return { text: suggestion, edited: false };
}

/** The class choice changed: re-fill the suggestion unless the teacher already typed. */
export function onChoiceChanged(draft: LessonNameDraft, suggestion: string): LessonNameDraft {
	return draft.edited ? draft : { text: suggestion, edited: false };
}

/** The teacher typed: her text is now kept. */
export function onTyped(text: string): LessonNameDraft {
	return { text, edited: true };
}

/** What is sent, or null when the name is blank (the form refuses to submit). */
export function submittedName(draft: LessonNameDraft): string | null {
	const name = cleanLessonName(draft.text);

	return name === '' ? null : name;
}
