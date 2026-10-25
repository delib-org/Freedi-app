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

export function setStudentStage(key: LessonStepKey | null): void {
	currentStage = key;
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
