import type { ClassPlan } from '@freedi/shared-types';
import { lessonRemovable, type RemovalTarget } from '@/lib/removalTargets';
import type { PlanRow } from '@/lib/planTree';

/**
 * What "Remove" and "Restore" act on for the plan on the plan screen
 * (docs/ia/join-class-remove-lessons.md 2): its doc, or, for an old lesson that is only a plan
 * (no doc), the lesson itself.
 */

function legacyLesson(
	row: PlanRow | undefined,
	planId: string,
): PlanRow['lessons'][number] | undefined {
	return row?.lessons.find((l) => l.id === planId);
}

export function planTargetOf(
	plan: ClassPlan | null,
	row: PlanRow | undefined,
	planId: string,
): RemovalTarget | null {
	if (plan) return { kind: 'plan', planId };

	return legacyLesson(row, planId) ? { kind: 'lesson', mainId: planId } : null;
}

/** The plan (or the old lesson standing for it) is on the removed list. */
export function planIsRemovedOf(
	plan: ClassPlan | null,
	row: PlanRow | undefined,
	planId: string,
): boolean {
	if (plan) return typeof plan.removedAt === 'number';

	return typeof legacyLesson(row, planId)?.removedAt === 'number';
}

/** A plan with a doc is always removable; an old lesson only while it has ended or not started. */
export function planRemovableOf(
	plan: ClassPlan | null,
	row: PlanRow | undefined,
	planId: string,
): boolean {
	if (plan) return true;
	const own = legacyLesson(row, planId);

	return own !== undefined && lessonRemovable(own);
}
