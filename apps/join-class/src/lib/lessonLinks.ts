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
	/** The name the teacher gave the lesson when starting it; '' for old lessons. */
	lessonName: string;
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
			lessonName: '',
			legacy: true,
		};
	}

	return {
		planId: link.planId,
		gameId: link.gameId,
		classId: link.classId ?? null,
		className: link.className ?? '',
		lessonName: link.lessonName?.trim() ?? '',
		legacy: false,
	};
}

/**
 * What the teacher calls this lesson: the name she gave it, else the lesson's own title
 * (the game's title, which students see). Old lessons have no name and read as today.
 */
export function lessonNameOf(
	lesson: Pick<Statement, 'statementId' | 'statementSettings' | 'statement'>,
): string {
	return linkOf(lesson).lessonName || lesson.statement;
}

/** The plan screen (the console's and the game screen's back target). */
export function planPathOf(planId: string): string {
	return `/t/plans/${planId}`;
}

/** The game screen. */
export function gamePathOf(planId: string, gameId: string): string {
	return `/t/plans/${planId}/games/${gameId}`;
}
