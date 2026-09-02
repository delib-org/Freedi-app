import type {
	StudioExistingActivitySnapshot,
	StudioPlanActivity,
	StudioPlanScheduledAction,
} from '@freedi/shared-types';

/**
 * Document activities in a plan: resolve the sources a draft is written
 * from (tempIds of plan activities, or statementIds of existing ones) to
 * titles the admin recognises.
 */
export function resolveSourceTitles(
	ids: string[] | undefined,
	activities: StudioPlanActivity[],
	existingActivities: StudioExistingActivitySnapshot[],
): string[] {
	if (!ids || ids.length === 0) return [];

	return ids.map((id) => {
		const planned = activities.find(
			(a) =>
				a.tempId === id || (a.existingStatementId !== undefined && a.existingStatementId === id),
		);
		if (planned) return planned.title;
		const existing = existingActivities.find((a) => a.statementId === id);

		return existing ? existing.title : id;
	});
}

/** A draft action's sources: its own list, else the target document's `draftFrom`. */
export function draftSourcesOf(
	action: StudioPlanScheduledAction,
	activities: StudioPlanActivity[],
): string[] | undefined {
	if (action.draftFrom && action.draftFrom.length > 0) return action.draftFrom;
	const target = activities.find(
		(a) =>
			(action.activityTempId !== undefined && a.tempId === action.activityTempId) ||
			(action.statementId !== undefined && a.existingStatementId === action.statementId),
	);

	return target?.draftFrom;
}
