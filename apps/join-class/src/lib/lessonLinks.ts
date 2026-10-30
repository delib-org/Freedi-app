import type { Statement } from '@freedi/shared-types';

/**
 * Where a lesson sits in plan > game > lesson (docs/ia/join-class-lesson-plan.md 2, 11.11).
 * A lesson made from a game carries `statementSettings.classLesson`. An old lesson
 * (made before plans, not yet moved by the migration) has none: it reads as a plan of
 * its own, `planId = gameId = its own id`, with no class.
 */
export interface LessonLink {
	planId: string;
	gameId: string;
	classId: string | null;
	/** The class's name when the lesson started; empty for "no class" and for old lessons. */
	className: string;
	/** True for a lesson with no `classLesson`. */
	legacy: boolean;
}

export function linkOf(lesson: Pick<Statement, 'statementId' | 'statementSettings'>): LessonLink {
	const link = lesson.statementSettings?.classLesson;
	if (!link) {
		return {
			planId: lesson.statementId,
			gameId: lesson.statementId,
			classId: null,
			className: '',
			legacy: true,
		};
	}

	return {
		planId: link.planId,
		gameId: link.gameId,
		classId: link.classId ?? null,
		className: link.className ?? '',
		legacy: false,
	};
}

/** The plan screen (the console's and the game screen's back target). */
export function planPathOf(planId: string): string {
	return `/t/plans/${planId}`;
}

/** The game screen. */
export function gamePathOf(planId: string, gameId: string): string {
	return `/t/plans/${planId}/games/${gameId}`;
}
