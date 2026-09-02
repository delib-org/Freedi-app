import type {
	StudioPlan,
	StudioPlanActivity,
	StudioPlanScheduledAction,
} from '@freedi/shared-types';

/**
 * Which plan rows changed between two versions — used to flash them in the
 * plan card. Pure and identity-free: rows are matched by `tempId` and
 * compared field by field, so a re-emitted identical plan changes nothing.
 * A first plan (no previous) flashes nothing: the whole card just appears.
 */
function sameActivity(a: StudioPlanActivity, b: StudioPlanActivity): boolean {
	return (
		a.type === b.type &&
		a.title === b.title &&
		(a.description ?? '') === (b.description ?? '') &&
		a.order === b.order &&
		a.openNow === b.openNow &&
		a.change === b.change &&
		(a.existingStatementId ?? '') === (b.existingStatementId ?? '') &&
		JSON.stringify(a.survey ?? null) === JSON.stringify(b.survey ?? null)
	);
}

function sameAction(a: StudioPlanScheduledAction, b: StudioPlanScheduledAction): boolean {
	return (
		a.action === b.action &&
		a.at === b.at &&
		(a.activityTempId ?? '') === (b.activityTempId ?? '') &&
		(a.statementId ?? '') === (b.statementId ?? '') &&
		(a.nudgeMessage ?? '') === (b.nudgeMessage ?? '')
	);
}

export function computeChangedTempIds(
	prev: StudioPlan | undefined | null,
	next: StudioPlan | undefined | null,
): string[] {
	if (!prev || !next) return [];

	const changed: string[] = [];

	const prevActivities = new Map(prev.activities.map((a) => [a.tempId, a]));
	for (const activity of next.activities) {
		const before = prevActivities.get(activity.tempId);
		if (!before || !sameActivity(before, activity)) changed.push(activity.tempId);
	}

	const prevActions = new Map(prev.scheduledActions.map((a) => [a.tempId, a]));
	for (const action of next.scheduledActions) {
		const before = prevActions.get(action.tempId);
		if (!before || !sameAction(before, action)) changed.push(action.tempId);
	}

	return changed;
}
