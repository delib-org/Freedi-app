import { isLessonRemovable } from '@freedi/shared-types';
import type { ClassLessonEntry } from './joinSubscriptions';

/**
 * What can be removed from the teacher's lists (docs/ia/join-class-remove-lessons.md 2), and the
 * pure rules about it. Nothing here touches Firebase, so it is testable on its own.
 */

export type RemovalTarget =
	| { kind: 'plan'; planId: string }
	| { kind: 'game'; planId: string; gameId: string }
	| { kind: 'lesson'; mainId: string };

/** A stable key per item, for busy / failed / done state. */
export function removalKey(target: RemovalTarget): string {
	switch (target.kind) {
		case 'plan':
			return `plan:${target.planId}`;
		case 'game':
			return `game:${target.planId}:${target.gameId}`;
		default:
			return `lesson:${target.mainId}`;
	}
}

/** A lesson that ended, or has not started, may be removed; a running, paused or open one may not. */
export function lessonRemovable(entry: Pick<ClassLessonEntry, 'status' | 'stepIndex'>): boolean {
	return isLessonRemovable({ status: entry.status, stepIndex: entry.stepIndex });
}
