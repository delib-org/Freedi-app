import { lessonStatusOf } from '@freedi/shared-types';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * The classroom callables that move tables or seats refuse while the lesson is
 * paused or ended (IA 13.6): the teacher stopped the room, so nothing under it
 * may shift. 'open' and 'live' pass. A missing main statement counts as live
 * (the callable's own not-found check speaks for it).
 */

export function assertLessonRunning(main: Statement | null | undefined): void {
	const status = lessonStatusOf(main?.statementSettings?.lessonPlan);
	if (status === 'paused') {
		throw new ClassroomError('failed-precondition', 'The lesson is paused');
	}
	if (status === 'ended') {
		throw new ClassroomError('failed-precondition', 'The lesson has ended');
	}
}

/**
 * The reset and hide callables (IA 18.4) work live, paused and open; only an
 * ended lesson is closed to them.
 */
export function assertLessonNotEnded(main: Statement | null | undefined): void {
	if (lessonStatusOf(main?.statementSettings?.lessonPlan) === 'ended') {
		throw new ClassroomError('failed-precondition', 'The lesson has ended', 'lesson-ended');
	}
}

/** The lesson's current step key (`steps[stepIndex]`), or null when the workspace has no plan. */
export function lessonStepOf(main: Statement | null | undefined): LessonStepKey | null {
	const plan = main?.statementSettings?.lessonPlan;

	return plan?.steps?.[plan.stepIndex] ?? null;
}
