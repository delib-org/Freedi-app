import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { stepLabelKey } from '@/lib/lessonCore';

/**
 * A step's name as the TEACHER reads it. Same as the students' name for every step but
 * the first: students wait for the teacher, the teacher watches the students join.
 */
export function consoleStepLabelKey(key: LessonStepKey): string {
	return key === 'waiting' ? 'console.step.waiting' : stepLabelKey(key);
}

export function consoleStepLabel(key: LessonStepKey): string {
	return t(consoleStepLabelKey(key));
}
