import { classSetLessonRemoved } from './classroom/api';
import { setGameRemoved, setPlanRemoved } from './classPlans';
import type { RemovalTarget } from './removalTargets';

/**
 * Removing lesson plans, games and lessons from the teacher's lists, and bringing them back
 * (docs/ia/join-class-remove-lessons.md). Nothing is deleted: a plan or game carries
 * `removedAt`, a lesson `statementSettings.lessonRemovedAt` (set by the server only).
 */

/** Removes (`removed: true`) or restores one item. Throws when the write or the callable fails. */
export async function applyRemoval(target: RemovalTarget, removed: boolean): Promise<void> {
	switch (target.kind) {
		case 'plan':
			await setPlanRemoved(target.planId, removed);

			return;
		case 'game':
			await setGameRemoved(target.planId, target.gameId, removed);

			return;
		default:
			await classSetLessonRemoved({ mainId: target.mainId, removed });
	}
}
