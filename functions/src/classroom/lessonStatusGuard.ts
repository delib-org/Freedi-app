import { lessonStatusOf } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
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
