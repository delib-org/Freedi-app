import {
	ChallengeDiagnosis,
	DEFAULT_DRAFT_CUTOFF,
	STUDIO_PLAN_MAX_ACTIVITIES,
	STUDIO_PLAN_MAX_SCHEDULED_ACTIONS,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanScheduledAction,
	StudioPlanSurveyConfig,
	StudioScheduledActionKind,
} from '@freedi/shared-types';
import { addDays, isoDateInTimezone, localDateTimeToMs, toOffsetIso } from './time';
import type { ActivityTemplate, ActivityTiming, BrainContext, DeliberationPattern } from './types';

/** Local hours used for scheduled actions. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 20;
export const NUDGE_HOUR = 10;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Days between the Draft step and the open of the drafted document (admin review). */
export const DRAFT_REVIEW_DAYS = 2;
/** Fills `{{segment}}` when the diagnosis names no audience segments. */
export const DEFAULT_SEGMENT = 'the whole community';

export const DEFAULT_SURVEY_CONFIG: StudioPlanSurveyConfig = {
	allowParticipantsToAddSuggestions: true,
	minEvaluationsPerQuestion: 3,
	askUserForASolutionBeforeEvaluation: true,
};

export const DEFAULT_NUDGE_MESSAGE =
	'A few days left to add your idea and rate the others — every rating shapes what we decide together.';

const TOPIC_BY_DECISION: Record<string, string> = {
	gatherIdeas: 'the ideas on the table',
	prioritize: 'our priorities',
	allocate: 'the budget',
	choose: 'the choice ahead of us',
	draftText: 'the text we are drafting',
	bridgeConflict: 'the disputed issue',
	legitimize: 'the proposed decision',
	educate: 'the topic we are learning about',
};

/** The noun phrase that fills `{{topic}}` in templates. */
export function describeTopic(ctx: BrainContext): string {
	const affected = ctx.diagnosis?.whoIsAffected?.trim();
	if (affected) return affected;
	const decisionType = ctx.diagnosis?.decisionType;
	if (decisionType && TOPIC_BY_DECISION[decisionType]) return TOPIC_BY_DECISION[decisionType];

	return 'our shared challenge';
}

export function fillTemplate(template: string, ctx: BrainContext, segment?: string): string {
	return template
		.replace(/\{\{\s*topic\s*\}\}/g, describeTopic(ctx))
		.replace(/\{\{\s*organization\s*\}\}/g, ctx.organizationName)
		.replace(/\{\{\s*segment\s*\}\}/g, segment ?? DEFAULT_SEGMENT);
}

/** A scheduled action before it gets a tempId and an `atLocal`. */
export interface ActionDraft {
	activityTempId: string;
	action: StudioScheduledActionKind;
	at: number;
	nudgeMessage?: string;
	draftFrom?: string[];
}

export interface PlacedActivity {
	actions: ActionDraft[];
	startAt: number;
	closeAt?: number;
}

function shouldSkip(template: ActivityTemplate, diagnosis: ChallengeDiagnosis | undefined): boolean {
	const rule = template.skipWhen;
	if (!rule) return false;
	const value = diagnosis?.[rule.field];
	if (value === undefined || value === null) return false;
	if (rule.below !== undefined) return typeof value === 'number' && value < rule.below;
	if (rule.oneOf) return typeof value === 'string' && rule.oneOf.includes(value);

	return false;
}

/** Open (unless openNow) on `startDateIso`, nudge before the close, close at the end. */
export function scheduleWindow(
	tempId: string,
	startDateIso: string,
	timing: ActivityTiming,
	timezone: string,
	openNow: boolean,
): PlacedActivity {
	const actions: ActionDraft[] = [];
	const startAt = localDateTimeToMs(startDateIso, OPEN_HOUR, 0, timezone);
	if (!openNow) actions.push({ activityTempId: tempId, action: 'open', at: startAt });
	let closeAt: number | undefined;
	const duration = timing.durationDays;
	if (duration !== undefined && duration > 0) {
		const closeDate = addDays(startDateIso, duration);
		const nudgeDays = timing.nudgeDaysBeforeClose;
		if (nudgeDays !== undefined && nudgeDays > 0 && nudgeDays < duration) {
			actions.push({
				activityTempId: tempId,
				action: 'nudge',
				at: localDateTimeToMs(addDays(closeDate, -nudgeDays), NUDGE_HOUR, 0, timezone),
				nudgeMessage: DEFAULT_NUDGE_MESSAGE,
			});
		}
		closeAt = localDateTimeToMs(closeDate, CLOSE_HOUR, 0, timezone);
		actions.push({ activityTempId: tempId, action: 'close', at: closeAt });
	}

	return { actions, startAt, closeAt };
}

/**
 * The Draft step for a document: `draft` one hour after the last source ends
 * (tomorrow morning when no source end is known), `open` DRAFT_REVIEW_DAYS
 * later so the admin can review, then the usual nudge + close window.
 */
export function scheduleDraftedDocument(
	tempId: string,
	sources: string[],
	sourceEnds: number[],
	timing: ActivityTiming,
	ctx: Pick<BrainContext, 'todayIso' | 'timezone'>,
): PlacedActivity {
	const draftAt =
		sourceEnds.length > 0
			? Math.max(...sourceEnds) + HOUR_MS
			: localDateTimeToMs(addDays(ctx.todayIso, 1), OPEN_HOUR, 0, ctx.timezone);
	const openDate = addDays(isoDateInTimezone(draftAt, ctx.timezone), DRAFT_REVIEW_DAYS);
	const window = scheduleWindow(tempId, openDate, timing, ctx.timezone, false);

	return {
		actions: [{ activityTempId: tempId, action: 'draft', at: draftAt, draftFrom: sources }, ...window.actions],
		startAt: window.startAt,
		closeAt: window.closeAt,
	};
}

/** Builds one activity from a template (no scheduled actions, no draft sources). */
export function instantiateActivity(
	template: ActivityTemplate,
	tempId: string,
	order: number,
	ctx: BrainContext,
	segment?: string,
): StudioPlanActivity {
	const activity: StudioPlanActivity = {
		tempId,
		type: template.engine,
		title: fillTemplate(template.questionTemplate, ctx, segment),
		order,
		openNow: template.openNow,
		role: template.role,
		change: 'add',
	};
	if (template.descriptionTemplate) {
		activity.description = fillTemplate(template.descriptionTemplate, ctx, segment);
	}
	if (template.engine === 'crowdSurvey') {
		activity.survey = { ...DEFAULT_SURVEY_CONFIG, ...(template.survey ?? {}) };
	}
	if (template.engine === 'document' && template.draftIntentTemplate) {
		activity.draftIntent = fillTemplate(template.draftIntentTemplate, ctx, segment);
	}

	return activity;
}

function resolveStartDate(timing: ActivityTiming, ctx: BrainContext, lastEnd: number | undefined): string {
	if (timing.startAfterPrevious !== undefined && lastEnd !== undefined) {
		return addDays(isoDateInTimezone(lastEnd, ctx.timezone), timing.startAfterPrevious);
	}

	return addDays(ctx.todayIso, timing.startAfterDays ?? 0);
}

export function finalizeActions(drafts: readonly ActionDraft[], timezone: string): StudioPlanScheduledAction[] {
	return drafts.slice(0, STUDIO_PLAN_MAX_SCHEDULED_ACTIONS).map((draft, index) => {
		const action: StudioPlanScheduledAction = {
			tempId: `s${index + 1}`,
			activityTempId: draft.activityTempId,
			action: draft.action,
			at: draft.at,
			atLocal: toOffsetIso(draft.at, timezone),
		};
		if (draft.nudgeMessage) action.nudgeMessage = draft.nudgeMessage;
		if (draft.draftFrom) action.draftFrom = draft.draftFrom;

		return action;
	});
}

/**
 * Turns a pattern into a concrete plan: tempIds a1.., order, dates from
 * `todayIso` + timing (ISO in `atLocal`, ms in `at`), roles, survey defaults,
 * one live session per audience segment, and a Draft step (draft → open →
 * close) for every document drafted from earlier steps. Text is English
 * template text — the LLM rewrites it.
 */
export function instantiatePattern(pattern: DeliberationPattern, ctx: BrainContext): StudioPlan {
	const segments = (ctx.diagnosis?.audienceSegments ?? []).map((segment) => segment.trim()).filter(Boolean);
	const existingIds = (ctx.existingActivities ?? []).map((row) => row.statementId);
	const activities: StudioPlanActivity[] = [];
	const drafts: ActionDraft[] = [];
	const tempIdsByStep = new Map<number, string[]>();
	const endAt = new Map<string, number>();
	let lastEnd: number | undefined;

	pattern.sequence.forEach((template, stepIndex) => {
		if (shouldSkip(template, ctx.diagnosis)) return;
		const copies: Array<string | undefined> = template.perSegment && segments.length > 0 ? segments : [undefined];
		const startDate = resolveStartDate(template.timing, ctx, lastEnd);
		copies.forEach((segment, copyIndex) => {
			if (activities.length >= STUDIO_PLAN_MAX_ACTIVITIES) return;
			const tempId = `a${activities.length + 1}`;
			const activity = instantiateActivity(template, tempId, activities.length, ctx, segment);
			const sources =
				template.engine === 'document'
					? [
							...(template.draftFrom ?? []).flatMap((step) => tempIdsByStep.get(step) ?? []),
							...(template.draftFromExisting ? existingIds : []),
						]
					: [];
			let placed: PlacedActivity;
			if (sources.length > 0) {
				activity.draftFrom = sources;
				activity.draftCutoff = template.draftCutoff ?? DEFAULT_DRAFT_CUTOFF;
				activity.openNow = false;
				const sourceEnds = sources
					.map((id) => endAt.get(id))
					.filter((end): end is number => end !== undefined);
				placed = scheduleDraftedDocument(tempId, sources, sourceEnds, template.timing, ctx);
			} else {
				placed = scheduleWindow(tempId, addDays(startDate, copyIndex), template.timing, ctx.timezone, template.openNow);
			}
			activities.push(activity);
			drafts.push(...placed.actions);
			const end = placed.closeAt ?? placed.startAt + DAY_MS;
			endAt.set(tempId, end);
			lastEnd = Math.max(lastEnd ?? 0, end);
			tempIdsByStep.set(stepIndex, [...(tempIdsByStep.get(stepIndex) ?? []), tempId]);
		});
	});

	const mainTitle = pattern.mainQuestionTemplate
		? fillTemplate(pattern.mainQuestionTemplate, ctx)
		: activities[0]?.title ?? fillTemplate('How should {{organization}} decide about {{topic}}?', ctx);

	return {
		mainQuestion: { title: mainTitle, description: pattern.summary },
		activities,
		scheduledActions: finalizeActions(drafts, ctx.timezone),
		summary: pattern.rationale,
	};
}
