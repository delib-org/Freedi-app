import { lessonLookOf } from '@freedi/shared-types';
import type { LessonLook, LessonSettingsHolder } from '@freedi/shared-types';

/**
 * The lesson's look on `<html>`. The game look is the default, so it is the
 * absence of the attribute; only the solid look writes `data-look="solid"`,
 * and every game-layer rule in `_game.scss` is scoped to
 * `:root:not([data-look="solid"])`. Solid therefore renders the old CSS untouched.
 */

export const LOOK_ATTRIBUTE = 'data-look';

/** The slice of an element this needs, so it runs without a DOM in tests. */
export interface LookTarget {
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
}

export function applyLessonLook(target: LookTarget, look: LessonLook): void {
	if (look === 'solid') target.setAttribute(LOOK_ATTRIBUTE, 'solid');
	else target.removeAttribute(LOOK_ATTRIBUTE);
}

/** Apply the look the lesson stores (absent = game). */
export function applyLessonLookOf(
	target: LookTarget,
	lesson: LessonSettingsHolder | null | undefined,
): void {
	applyLessonLook(target, lessonLookOf(lesson));
}
