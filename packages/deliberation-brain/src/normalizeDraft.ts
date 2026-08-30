import {
	DEFAULT_DRAFT_CUTOFF,
	StudioDraftCutoff,
	StudioPlanActivity,
	StudioPlanScheduledAction,
} from '@freedi/shared-types';
import { DAY_MS, DRAFT_REVIEW_DAYS, HOUR_MS } from './instantiate';
import { toOffsetIso } from './time';

/**
 * The Draft-step rules of `normalizePlan` (PLAYBOOK.md §2 rule 2): sources
 * resolve to activities in the plan, a drafted document is hidden until its
 * draft is reviewed, and a document with sources always has a `draft` action.
 */
export interface DraftRuleContext {
	existingIds: readonly string[];
	now: number;
	timezone: string;
	usedActionIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Turns whatever the model emitted as `draftCutoff` into a valid cutoff (or the default). */
export function normalizeCutoff(raw: unknown): StudioDraftCutoff {
	if (!isRecord(raw)) return { ...DEFAULT_DRAFT_CUTOFF };
	const mode = raw.mode;
	if (mode !== 'chosen' && mode !== 'topN' && mode !== 'threshold') return { ...DEFAULT_DRAFT_CUTOFF };
	const cutoff: StudioDraftCutoff = { mode };
	const n = finite(raw.n);
	if (n !== undefined && n > 0) cutoff.n = Math.round(n);
	const minConsensus = finite(raw.minConsensus);
	if (minConsensus !== undefined) cutoff.minConsensus = minConsensus;
	const minEvaluators = finite(raw.minEvaluators);
	if (minEvaluators !== undefined && minEvaluators > 0) cutoff.minEvaluators = Math.round(minEvaluators);
	if (cutoff.mode === 'topN' && cutoff.n === undefined) cutoff.n = DEFAULT_DRAFT_CUTOFF.n;
	if (cutoff.minEvaluators === undefined) cutoff.minEvaluators = DEFAULT_DRAFT_CUTOFF.minEvaluators;

	return cutoff;
}

/**
 * Keeps the entries that are activity tempIds in the plan or existing
 * statementIds; drops the rest (and `self`) with a problem each.
 */
export function resolveSources(
	raw: readonly string[] | null | undefined,
	self: string,
	activities: readonly StudioPlanActivity[],
	existingIds: readonly string[],
	problems: string[],
	label: string,
): string[] | undefined {
	if (!raw) return undefined;
	const tempIds = new Set(activities.map((activity) => activity.tempId));
	const sources: string[] = [];
	for (const entry of raw) {
		const id = entry.trim();
		if (!id || id === self || sources.includes(id)) continue;
		if (tempIds.has(id) || existingIds.includes(id)) sources.push(id);
		else problems.push(`${label}: draft source "${id}" is not an activity in the plan; it was dropped.`);
	}

	return sources;
}

function nextActionId(used: Set<string>): string {
	let index = used.size + 1;
	while (used.has(`s${index}`)) index += 1;
	const tempId = `s${index}`;
	used.add(tempId);

	return tempId;
}

function targetOf(action: StudioPlanScheduledAction, activities: readonly StudioPlanActivity[]): StudioPlanActivity | undefined {
	if (action.activityTempId) return activities.find((activity) => activity.tempId === action.activityTempId);
	if (action.statementId) return activities.find((activity) => activity.existingStatementId === action.statementId);

	return undefined;
}

function label(activity: StudioPlanActivity): string {
	return `Activity ${activity.tempId} "${activity.title}"`;
}

/** `draft` actions: must target a document, sources default to the document's. */
function normalizeDraftActions(
	activities: StudioPlanActivity[],
	actions: StudioPlanScheduledAction[],
	ctx: DraftRuleContext,
	problems: string[],
): StudioPlanScheduledAction[] {
	return actions.filter((action) => {
		if (action.action !== 'draft') return true;
		const target = targetOf(action, activities);
		if (!target || target.type !== 'document') {
			problems.push(`Dropped scheduled draft (${action.tempId}): a draft must target a document activity.`);

			return false;
		}
		action.activityTempId = target.tempId;
		delete action.statementId;
		const own = resolveSources(action.draftFrom, target.tempId, activities, ctx.existingIds, problems, `Scheduled draft (${action.tempId})`);
		const sources = own && own.length > 0 ? own : target.draftFrom ?? [];
		if (sources.length === 0) {
			problems.push(`Dropped scheduled draft (${action.tempId}): neither the action nor ${label(target)} names source activities.`);

			return false;
		}
		action.draftFrom = sources;
		if (!target.draftFrom || target.draftFrom.length === 0) target.draftFrom = sources;

		return true;
	});
}

function latestClose(sources: readonly string[], actions: readonly StudioPlanScheduledAction[]): number | undefined {
	let latest: number | undefined;
	for (const action of actions) {
		if (action.action !== 'close') continue;
		const key = action.activityTempId ?? action.statementId ?? '';
		if (!sources.includes(key)) continue;
		if (latest === undefined || action.at > latest) latest = action.at;
	}

	return latest;
}

/**
 * Documents: sources ⇒ cutoff default, hidden until reviewed, a `draft` action
 * (synthesized when missing) and an `open` after it. No sources ⇒ the text
 * must already exist, so a new document opens now.
 */
export function applyDraftRules(
	activities: StudioPlanActivity[],
	actions: StudioPlanScheduledAction[],
	ctx: DraftRuleContext,
	problems: string[],
): StudioPlanScheduledAction[] {
	for (const activity of activities) {
		if (activity.type === 'document') continue;
		if (activity.draftFrom !== undefined || activity.draftCutoff !== undefined || activity.draftIntent !== undefined) {
			problems.push(`${label(activity)} is not a document; only a document can be drafted from other activities. Its draft fields were dropped.`);
			delete activity.draftFrom;
			delete activity.draftCutoff;
			delete activity.draftIntent;
		}
	}

	const kept = normalizeDraftActions(activities, actions, ctx, problems);

	for (const activity of activities) {
		if (activity.type !== 'document') continue;
		const sources = activity.draftFrom ?? [];
		if (sources.length === 0) {
			delete activity.draftFrom;
			delete activity.draftCutoff;
			if (activity.change === 'add') {
				activity.openNow = true;
				problems.push(
					`${label(activity)} has no draft sources: a document without sources must already have its text — the admin will paste it in the document. It opens now.`,
				);
			}
			continue;
		}
		activity.draftFrom = sources;
		activity.draftCutoff = activity.draftCutoff ?? { ...DEFAULT_DRAFT_CUTOFF };
		activity.openNow = false;

		const mine = kept.filter((action) => action.activityTempId === activity.tempId);
		let draft = mine.find((action) => action.action === 'draft');
		if (!draft) {
			const close = latestClose(sources, kept);
			const at = close !== undefined ? close + HOUR_MS : ctx.now + DAY_MS;
			draft = { tempId: nextActionId(ctx.usedActionIds), activityTempId: activity.tempId, action: 'draft', at, atLocal: toOffsetIso(at, ctx.timezone), draftFrom: sources };
			kept.push(draft);
			problems.push(`${label(activity)} is drafted from ${sources.join(', ')} but had no draft step; added a draft step at ${draft.atLocal}.`);
		}
		if (!mine.some((action) => action.action === 'open')) {
			const at = draft.at + DRAFT_REVIEW_DAYS * DAY_MS;
			kept.push({ tempId: nextActionId(ctx.usedActionIds), activityTempId: activity.tempId, action: 'open', at, atLocal: toOffsetIso(at, ctx.timezone) });
			problems.push(`${label(activity)} had no open after its draft; added an open ${DRAFT_REVIEW_DAYS} days later for the admin's review.`);
		}
	}

	return kept;
}
