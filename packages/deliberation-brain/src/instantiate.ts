import {
	STUDIO_PLAN_MAX_ACTIVITIES,
	STUDIO_PLAN_MAX_SCHEDULED_ACTIONS,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanScheduledAction,
	StudioPlanSurveyConfig,
} from '@freedi/shared-types';
import { addDays, localDateTimeToMs, toOffsetIso } from './time';
import type { ActivityTemplate, BrainContext, DeliberationPattern } from './types';

/** Local hours used for scheduled actions. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 20;
export const NUDGE_HOUR = 10;

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

export function fillTemplate(template: string, ctx: BrainContext): string {
	return template
		.replace(/\{\{\s*topic\s*\}\}/g, describeTopic(ctx))
		.replace(/\{\{\s*organization\s*\}\}/g, ctx.organizationName);
}

interface ActionDraft {
	activityTempId: string;
	action: StudioPlanScheduledAction['action'];
	dateIso: string;
	hour: number;
	nudgeMessage?: string;
}

function draftActions(template: ActivityTemplate, tempId: string, todayIso: string): ActionDraft[] {
	const drafts: ActionDraft[] = [];
	const start = addDays(todayIso, template.timing.startAfterDays ?? 0);
	if (!template.openNow) {
		drafts.push({ activityTempId: tempId, action: 'open', dateIso: start, hour: OPEN_HOUR });
	}
	const duration = template.timing.durationDays;
	if (duration !== undefined && duration > 0) {
		const closeDate = addDays(start, duration);
		const nudgeDays = template.timing.nudgeDaysBeforeClose;
		if (nudgeDays !== undefined && nudgeDays > 0 && nudgeDays < duration) {
			drafts.push({
				activityTempId: tempId,
				action: 'nudge',
				dateIso: addDays(closeDate, -nudgeDays),
				hour: NUDGE_HOUR,
				nudgeMessage: DEFAULT_NUDGE_MESSAGE,
			});
		}
		drafts.push({ activityTempId: tempId, action: 'close', dateIso: closeDate, hour: CLOSE_HOUR });
	}

	return drafts;
}

/** Builds one activity from a template (no scheduled actions). */
export function instantiateActivity(
	template: ActivityTemplate,
	tempId: string,
	order: number,
	ctx: BrainContext,
): StudioPlanActivity {
	const activity: StudioPlanActivity = {
		tempId,
		type: template.engine,
		title: fillTemplate(template.questionTemplate, ctx),
		order,
		openNow: template.openNow,
		role: template.role,
		change: 'add',
	};
	if (template.descriptionTemplate) {
		activity.description = fillTemplate(template.descriptionTemplate, ctx);
	}
	if (template.engine === 'crowdSurvey') {
		activity.survey = { ...DEFAULT_SURVEY_CONFIG, ...(template.survey ?? {}) };
	}

	return activity;
}

/**
 * Turns a pattern into a concrete plan: tempIds a1.., order, dates from
 * `todayIso` + timing (ISO in `atLocal`, ms in `at`), roles and survey
 * defaults. Text is English template text — the LLM rewrites it.
 */
export function instantiatePattern(pattern: DeliberationPattern, ctx: BrainContext): StudioPlan {
	const activities: StudioPlanActivity[] = [];
	const drafts: ActionDraft[] = [];
	pattern.sequence.slice(0, STUDIO_PLAN_MAX_ACTIVITIES).forEach((template, index) => {
		const tempId = `a${index + 1}`;
		activities.push(instantiateActivity(template, tempId, index, ctx));
		drafts.push(...draftActions(template, tempId, ctx.todayIso));
	});

	const scheduledActions: StudioPlanScheduledAction[] = drafts
		.slice(0, STUDIO_PLAN_MAX_SCHEDULED_ACTIONS)
		.map((draft, index) => {
			const at = localDateTimeToMs(draft.dateIso, draft.hour, 0, ctx.timezone);
			const action: StudioPlanScheduledAction = {
				tempId: `s${index + 1}`,
				activityTempId: draft.activityTempId,
				action: draft.action,
				at,
				atLocal: toOffsetIso(at, ctx.timezone),
			};
			if (draft.nudgeMessage) action.nudgeMessage = draft.nudgeMessage;

			return action;
		});

	const mainTitle = pattern.mainQuestionTemplate
		? fillTemplate(pattern.mainQuestionTemplate, ctx)
		: activities[0]?.title ?? fillTemplate('How should {{organization}} decide about {{topic}}?', ctx);

	return {
		mainQuestion: { title: mainTitle, description: pattern.summary },
		activities,
		scheduledActions,
		summary: pattern.rationale,
	};
}
