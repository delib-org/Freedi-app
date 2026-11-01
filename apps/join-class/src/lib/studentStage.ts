import type { LessonStepKey } from '@freedi/shared-types';
import { stepLabelKey } from './lessonCore';
import { t } from './i18n';

/**
 * The lesson step the student is on, kept for the shared StudentFrame so every
 * student screen (waiting, side, tables, table talk, proposals, vote, summary)
 * shows the same stage name as its heading, without each screen passing it in.
 * StudentStage sets it on every render; null (paused / ended) shows no stage.
 * The names are the `step.<key>` strings the teacher console and projector use.
 */
let currentStage: LessonStepKey | null = null;

/** Where the current step sits in the lesson's own steps: 1-based `n` of `total`. */
export interface StageProgress {
	n: number;
	total: number;
}

let currentProgress: StageProgress | null = null;

/** `position` is the step's 0-based index in a lesson of `total` steps; omit it to show no progress. */
export function setStudentStage(
	key: LessonStepKey | null,
	position?: { index: number; total: number },
): void {
	currentStage = key;
	currentProgress = key && position ? progressOf(position.index, position.total) : null;
}

/** A sane 1-based progress, or null when the numbers cannot be shown. */
export function progressOf(index: number, total: number): StageProgress | null {
	if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) return null;
	if (index < 0 || index >= total) return null;

	return { n: index + 1, total };
}

/** The current step's place in the lesson ("step n of total"), or null. */
export function studentStageProgress(): StageProgress | null {
	return currentProgress;
}

/** i18n key of the stage heading, or null when no stage is set. */
export function stageTitleKey(key: LessonStepKey | null): string | null {
	return key ? stepLabelKey(key) : null;
}

/** The translated stage name for the current step, or null. */
export function studentStageTitle(): string | null {
	const key = stageTitleKey(currentStage);

	return key ? t(key) : null;
}
