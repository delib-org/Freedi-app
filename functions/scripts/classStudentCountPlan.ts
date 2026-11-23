import { isClassLesson, studentCountOf } from '@freedi/shared-types';

/**
 * What backfillClassStudentCount does to one statement (pure, so it is tested
 * without Firestore). See that script for the whole procedure.
 */

/** The parts of a statement the plan reads. */
export interface LessonLike {
	statementSettings?: {
		classHome?: unknown;
		classLesson?: unknown;
		lessonPlan?: unknown;
		/** Typed as stored by the server; a hand-edited doc may hold a fraction or a negative. */
		studentCount?: number;
	};
}

export type StudentCountPlan =
	| { action: 'skip' }
	| { action: 'unchanged'; count: number }
	| { action: 'write'; count: number };

/** True when the statement is a lesson, so its students are worth counting. */
export function needsStudentCount(statement: LessonLike | undefined): boolean {
	return isClassLesson(statement);
}

/**
 * `counted` is the from-scratch count (countClassStudents). A non-lesson (a
 * class home, a statement with no plan) is skipped; a lesson whose stored count
 * is already exact is left alone, so a second run writes nothing; any other
 * stored value (missing, negative, fractional, stale) is replaced.
 */
export function planStudentCount(
	statement: LessonLike | undefined,
	counted: number,
): StudentCountPlan {
	if (!needsStudentCount(statement)) return { action: 'skip' };
	if (!Number.isInteger(counted) || counted < 0) return { action: 'skip' };
	if (studentCountOf(statement) === counted) return { action: 'unchanged', count: counted };

	return { action: 'write', count: counted };
}
