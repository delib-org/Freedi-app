import {
	CLASS_GAME_MAX_PARAGRAPHS,
	CLASS_GAME_MAX_QUESTIONS,
	checkSnapshot,
	isClassLesson,
	lessonFromSnapshot,
	snapshotFromLesson,
} from '@freedi/shared-types';
import type {
	ClassGameSnapshot,
	ClassLessonLink,
	LessonStatements,
	Statement,
	User,
} from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Lesson copies (classCloneLesson, classStartLesson, classSnapshotGame, the
 * migration). The allowlist itself lives in @freedi/shared-types
 * (classGameSnapshot.ts: snapshotFromLesson / lessonFromSnapshot), shared with
 * the join-class client. This file adds the server's errors, the caps and the
 * class code generator. No Firestore here.
 */

export {
	LESSON_STEPS,
	compareByManualOrder,
	flattenLines,
	isIntroParagraph,
	isPlanQuestion,
} from '@freedi/shared-types';

/** Caps on what one copy may carry (the plan screen's own limits are lower). */
export const CLONE_MAX_QUESTIONS = CLASS_GAME_MAX_QUESTIONS;
export const CLONE_MAX_PARAGRAPHS = CLASS_GAME_MAX_PARAGRAPHS;

/** Class code alphabet: six digits, leading zeros allowed (same as the client's generator). */
export const CLASS_CODE_LENGTH = 6;
const CLASS_CODE_RADIX = 10;

/** A random six-digit code. `random` returns [0, 1). */
export function generateClassCode(random: () => number = Math.random): string {
	let code = '';
	for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
		code += Math.floor(random() * CLASS_CODE_RADIX).toString();
	}

	return code;
}

/**
 * A join-class lesson, wherever it sits: a statement with a lesson plan that is
 * not a home. No `parentId === 'top'` test, so old top-level lessons and lessons
 * under a home both pass.
 */
export function isLesson(main: Statement): boolean {
	return isClassLesson(main);
}

/** A lesson's plan as a validated snapshot; refuses one over the caps. */
export function lessonSnapshot(
	source: Statement,
	children: readonly Statement[],
): ClassGameSnapshot {
	const checked = checkSnapshot(snapshotFromLesson(source, children));
	if (!checked.ok) {
		throw new ClassroomError('resource-exhausted', 'This lesson is too big to copy');
	}

	return checked.snapshot;
}

/** A snapshot read from a game doc (client-written): shape and caps checked. */
export function requireGameSnapshot(raw: unknown): ClassGameSnapshot {
	const checked = checkSnapshot(raw);
	if (!checked.ok) {
		throw checked.problem === 'too-big'
			? new ClassroomError('resource-exhausted', 'This game is too big to play')
			: new ClassroomError('failed-precondition', 'This game is not valid');
	}

	return checked.snapshot;
}

export interface LessonCopyInput {
	source: Statement;
	/** Direct children of the source (any type); the mapper picks the plan's own. */
	children: readonly Statement[];
	/** The home the copy goes under. */
	homeId: string;
	newMainId: string;
	/** Name of the new lesson; the source's title when empty. */
	title?: string;
	/** The teacher making the copy; becomes creator of every new statement. */
	creator: User;
	classCode: string;
	now: number;
	/** Ids for the new questions and paragraphs. */
	newId: () => string;
	classLesson?: ClassLessonLink;
}

export type LessonCopy = LessonStatements;

/** Builds the lesson from a snapshot under a home; an internal error when it cannot. */
export function buildLessonFromSnapshot(
	args: Parameters<typeof lessonFromSnapshot>[0],
): LessonStatements {
	const built = lessonFromSnapshot(args);
	if (!built) throw new ClassroomError('internal', 'Could not build the lesson');

	return built;
}

/** A copy of a lesson's plan (snapshot then lesson) under `homeId`. */
export function buildLessonCopy(input: LessonCopyInput): LessonCopy {
	const { source } = input;
	const snapshot = lessonSnapshot(source, input.children);
	const title = (input.title ?? '').trim() ? (input.title as string) : source.statement;

	return buildLessonFromSnapshot({
		snapshot,
		homeId: input.homeId,
		lessonId: input.newMainId,
		title,
		creator: input.creator,
		classCode: input.classCode,
		now: input.now,
		newId: input.newId,
		classLesson: input.classLesson,
		sourceLesson: { id: source.statementId, title: source.statement },
	});
}
