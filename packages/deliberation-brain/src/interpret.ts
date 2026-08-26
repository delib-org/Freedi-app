import {
	ChallengeDiagnosis,
	DIAGNOSIS_FIELDS,
	STUDIO_NUDGE_MESSAGE_MAX,
	STUDIO_PLAN_MAX_ACTIVITIES,
	STUDIO_PLAN_MAX_SCHEDULED_ACTIONS,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanChange,
	StudioPlanScheduledAction,
	StudioPlanSchema,
	StudioPlanSurveyConfig,
} from '@freedi/shared-types';
import { BaseIssue, InferOutput, getDotPath, safeParse } from 'valibot';
import { critiquePlan } from './critic';
import { mergeDiagnosis, sanitizeDiagnosis } from './diagnosis';
import { getPattern } from './patterns';
import { LlmActivitySchema, LlmPlanResponseSchema, LlmPlanSchema, LlmSurveySchema } from './schema';

export interface InterpretOptions {
	mode: 'new' | 'existing';
	existingIds: readonly string[];
	now: number;
	previousPlan?: StudioPlan;
	previousDiagnosis?: ChallengeDiagnosis;
}

export interface InterpretedResponse {
	reply: string;
	readyToBuild: boolean;
	diagnosis: ChallengeDiagnosis | undefined;
	patternId: string | undefined;
	missingCritical: string[];
	plan: StudioPlan | undefined;
	problems: string[];
	blocking: boolean;
}

export class PlanParseError extends Error {
	issues: string[];

	constructor(issues: string[]) {
		super(`LLM response does not match the plan contract: ${issues.join('; ')}`);
		this.name = 'PlanParseError';
		this.issues = issues;
	}
}

/** Earliest a scheduled action may run, relative to now. */
export const MIN_LEAD_MS = 60 * 1000;

export function formatIssues(issues: readonly BaseIssue<unknown>[]): string[] {
	return issues.map((issue) => {
		const path = getDotPath(issue);

		return path ? `${path}: ${issue.message}` : issue.message;
	});
}

function uniqueId(prefix: string, index: number, used: Set<string>): string {
	let candidate = `${prefix}${index}`;
	let bump = index;
	while (used.has(candidate)) {
		bump += 1;
		candidate = `${prefix}${bump}`;
	}

	return candidate;
}

function cleanText(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();

	return trimmed ? trimmed : undefined;
}

type LlmSurvey = InferOutput<typeof LlmSurveySchema>;
type LlmActivity = InferOutput<typeof LlmActivitySchema>;

function normalizeSurvey(raw: LlmSurvey, activityTempId: string): StudioPlanSurveyConfig {
	const survey: StudioPlanSurveyConfig = {};
	const intro = cleanText(raw.intro);
	if (intro) survey.intro = intro;
	if (raw.explanationPages && raw.explanationPages.length > 0) {
		survey.explanationPages = raw.explanationPages.map((page) => ({
			title: page.title,
			content: page.content,
		}));
	}
	if (typeof raw.allowParticipantsToAddSuggestions === 'boolean') {
		survey.allowParticipantsToAddSuggestions = raw.allowParticipantsToAddSuggestions;
	}
	if (typeof raw.minEvaluationsPerQuestion === 'number' && Number.isFinite(raw.minEvaluationsPerQuestion)) {
		survey.minEvaluationsPerQuestion = Math.max(1, Math.round(raw.minEvaluationsPerQuestion));
	}
	if (typeof raw.askUserForASolutionBeforeEvaluation === 'boolean') {
		survey.askUserForASolutionBeforeEvaluation = raw.askUserForASolutionBeforeEvaluation;
	}
	if (raw.extraQuestions && raw.extraQuestions.length > 0) {
		const used = new Set<string>();
		survey.extraQuestions = raw.extraQuestions.map((question, index) => {
			let tempId = cleanText(question.tempId) ?? '';
			if (!tempId || used.has(tempId)) tempId = uniqueId(`${activityTempId}-q`, index + 1, used);
			used.add(tempId);
			const description = cleanText(question.description);

			return { tempId, title: question.title, ...(description ? { description } : {}) };
		});
	}

	return survey;
}

function normalizeActivity(
	raw: LlmActivity,
	index: number,
	used: Set<string>,
	opts: InterpretOptions,
	problems: string[],
): StudioPlanActivity {
	let tempId = cleanText(raw.tempId) ?? '';
	if (!tempId || used.has(tempId)) tempId = uniqueId('a', index + 1, used);
	used.add(tempId);

	let existingStatementId: string | undefined;
	let change: StudioPlanChange = 'add';
	if (opts.mode === 'existing') {
		const requested = cleanText(raw.existingStatementId);
		if (requested && opts.existingIds.includes(requested)) {
			existingStatementId = requested;
			change = raw.change === 'update' ? 'update' : 'keep';
		} else if (requested) {
			problems.push(
				`Activity ${tempId} referenced an unknown existing statement "${requested}"; it is treated as a new activity.`,
			);
		}
	}

	const activity: StudioPlanActivity = {
		tempId,
		type: raw.type,
		title: raw.title.trim(),
		order: index,
		openNow: raw.openNow ?? (change !== 'add' || index === 0),
		change,
	};
	const description = cleanText(raw.description);
	if (description) activity.description = description;
	if (raw.role) activity.role = raw.role;
	if (existingStatementId) activity.existingStatementId = existingStatementId;
	if (raw.type === 'crowdSurvey' && raw.survey) activity.survey = normalizeSurvey(raw.survey, tempId);

	return activity;
}

/**
 * Turns the loose LLM plan into a strict StudioPlan, repairing what can be
 * repaired and reporting what was dropped.
 */
export function normalizePlan(
	raw: unknown,
	opts: InterpretOptions,
): { plan: StudioPlan | undefined; problems: string[] } {
	const problems: string[] = [];
	const parsed = safeParse(LlmPlanSchema, raw);
	if (!parsed.success) {
		return { plan: undefined, problems: [`Plan shape invalid: ${formatIssues(parsed.issues).join('; ')}`] };
	}
	const input = parsed.output;

	if (input.activities.length > STUDIO_PLAN_MAX_ACTIVITIES) {
		problems.push(
			`The plan had ${input.activities.length} activities; only the first ${STUDIO_PLAN_MAX_ACTIVITIES} were kept.`,
		);
	}
	const usedActivityIds = new Set<string>();
	const activities = input.activities
		.slice(0, STUDIO_PLAN_MAX_ACTIVITIES)
		.map((activity, index) => normalizeActivity(activity, index, usedActivityIds, opts, problems));

	const rawActions = input.scheduledActions ?? [];
	if (rawActions.length > STUDIO_PLAN_MAX_SCHEDULED_ACTIONS) {
		problems.push(
			`The plan had ${rawActions.length} scheduled actions; only the first ${STUDIO_PLAN_MAX_SCHEDULED_ACTIONS} were kept.`,
		);
	}
	const usedActionIds = new Set<string>();
	const scheduledActions: StudioPlanScheduledAction[] = [];
	rawActions.slice(0, STUDIO_PLAN_MAX_SCHEDULED_ACTIONS).forEach((rawAction, index) => {
		const at = Date.parse(rawAction.at);
		if (Number.isNaN(at)) {
			problems.push(`Dropped scheduled ${rawAction.action}: unreadable date "${rawAction.at}".`);

			return;
		}
		if (at < opts.now + MIN_LEAD_MS) {
			problems.push(`Dropped scheduled ${rawAction.action} at ${rawAction.at}: it is in the past.`);

			return;
		}
		const target = rawAction.target.trim();
		let activityTempId: string | undefined;
		let statementId: string | undefined;
		if (usedActivityIds.has(target)) activityTempId = target;
		else if (opts.existingIds.includes(target)) statementId = target;
		else {
			problems.push(`Dropped scheduled ${rawAction.action}: target "${target}" is not an activity in the plan.`);

			return;
		}
		let tempId = cleanText(rawAction.tempId) ?? '';
		if (!tempId || usedActionIds.has(tempId)) tempId = uniqueId('s', index + 1, usedActionIds);
		usedActionIds.add(tempId);

		const action: StudioPlanScheduledAction = { tempId, action: rawAction.action, at, atLocal: rawAction.at };
		if (activityTempId) action.activityTempId = activityTempId;
		if (statementId) action.statementId = statementId;
		if (rawAction.action === 'nudge') {
			const message = cleanText(rawAction.nudgeMessage);
			if (message) action.nudgeMessage = message.slice(0, STUDIO_NUDGE_MESSAGE_MAX);
		}
		scheduledActions.push(action);
	});

	const mainDescription = cleanText(input.mainQuestion.description);
	const candidate: StudioPlan = {
		mainQuestion: {
			title: input.mainQuestion.title.trim(),
			...(mainDescription ? { description: mainDescription } : {}),
		},
		activities,
		scheduledActions,
		summary: cleanText(input.summary) ?? '',
	};
	const final = safeParse(StudioPlanSchema, candidate);
	if (!final.success) {
		problems.push(`Plan failed validation: ${formatIssues(final.issues).join('; ')}`);

		return { plan: undefined, problems };
	}

	return { plan: final.output, problems };
}

function isDiagnosisField(value: string): boolean {
	return (DIAGNOSIS_FIELDS as readonly string[]).includes(value);
}

/**
 * valibot parse (throws PlanParseError) → mergeDiagnosis → normalizePlan → critiquePlan.
 */
export function interpretLlmResponse(parsedJson: unknown, opts: InterpretOptions): InterpretedResponse {
	const parsed = safeParse(LlmPlanResponseSchema, parsedJson);
	if (!parsed.success) throw new PlanParseError(formatIssues(parsed.issues));
	const response = parsed.output;

	const merged = mergeDiagnosis(opts.previousDiagnosis, sanitizeDiagnosis(response.diagnosis));
	const diagnosis = Object.keys(merged).length > 0 ? merged : undefined;

	const requestedPattern = cleanText(response.patternId);
	const patternId = requestedPattern && getPattern(requestedPattern) ? requestedPattern : undefined;

	const missingCritical = (response.missingCritical ?? []).filter(isDiagnosisField);

	const normalized = response.plan
		? normalizePlan(response.plan, opts)
		: { plan: undefined, problems: [] as string[] };
	const critic = normalized.plan
		? critiquePlan(normalized.plan, { now: opts.now, diagnosis })
		: { problems: [], blocking: false };

	return {
		reply: response.reply.trim(),
		readyToBuild: response.readyToBuild && normalized.plan !== undefined && !critic.blocking,
		diagnosis,
		patternId,
		missingCritical,
		plan: normalized.plan,
		problems: [...normalized.problems, ...critic.problems],
		blocking: critic.blocking,
	};
}
