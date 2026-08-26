import type {
	StudioPlan,
	StudioPlanActivity,
	StudioPlanScheduledAction,
	StudioProposalDiff,
} from '@freedi/shared-types';

const IGNORED_KEYS = new Set(['atLocal']);

/** Deterministic JSON: sorted keys, undefined dropped, `atLocal` ignored. */
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
	if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record)
		.filter((key) => record[key] !== undefined && !IGNORED_KEYS.has(key))
		.sort();

	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function plansEqual(a: StudioPlan | undefined, b: StudioPlan | undefined): boolean {
	if (a === undefined || b === undefined) return a === b;

	return stableStringify(a) === stableStringify(b);
}

function activityFingerprint(activity: StudioPlanActivity): string {
	return stableStringify({
		type: activity.type,
		title: activity.title,
		description: activity.description,
		openNow: activity.openNow,
		survey: activity.survey,
		change: activity.change,
		existingStatementId: activity.existingStatementId,
	});
}

function actionFingerprint(action: StudioPlanScheduledAction): string {
	return stableStringify({
		activityTempId: action.activityTempId,
		statementId: action.statementId,
		action: action.action,
		at: action.at,
		nudgeMessage: action.nudgeMessage,
	});
}

/** What the admin changed between the AI proposal and what was built, by tempId. */
export function computeProposalDiff(
	proposed: StudioPlan | undefined,
	built: StudioPlan | undefined,
): StudioProposalDiff {
	const proposedActivities = new Map(
		(proposed?.activities ?? []).map((activity) => [activity.tempId, activity]),
	);
	const builtActivities = new Map(
		(built?.activities ?? []).map((activity) => [activity.tempId, activity]),
	);

	let activitiesAdded = 0;
	let activitiesEdited = 0;
	for (const [tempId, activity] of builtActivities) {
		const before = proposedActivities.get(tempId);
		if (!before) activitiesAdded += 1;
		else if (activityFingerprint(before) !== activityFingerprint(activity)) activitiesEdited += 1;
	}
	let activitiesRemoved = 0;
	for (const tempId of proposedActivities.keys()) {
		if (!builtActivities.has(tempId)) activitiesRemoved += 1;
	}

	const proposedActions = new Map(
		(proposed?.scheduledActions ?? []).map((action) => [action.tempId, action]),
	);
	const builtActions = new Map(
		(built?.scheduledActions ?? []).map((action) => [action.tempId, action]),
	);
	let actionsChanged = 0;
	for (const [tempId, action] of builtActions) {
		const before = proposedActions.get(tempId);
		if (!before || actionFingerprint(before) !== actionFingerprint(action)) actionsChanged += 1;
	}
	for (const tempId of proposedActions.keys()) {
		if (!builtActions.has(tempId)) actionsChanged += 1;
	}

	const mainQuestionEdited =
		stableStringify(proposed?.mainQuestion) !== stableStringify(built?.mainQuestion);

	return { activitiesAdded, activitiesRemoved, activitiesEdited, actionsChanged, mainQuestionEdited };
}
