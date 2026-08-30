import {
	StudioActivityTypeSchema,
	StudioPlanChangeSchema,
	StudioScheduledActionKindSchema,
} from '@freedi/shared-types';
import {
	InferOutput,
	array,
	boolean,
	looseObject,
	nullish,
	number,
	optional,
	picklist,
	string,
} from 'valibot';

export const ACTIVITY_ROLES = [
	'widen',
	'measure',
	'converge',
	'deepen',
	'decide',
	'ratify',
	'comment',
	'write',
] as const;

/**
 * The JSON contract the LLM is asked to emit. Loose on purpose: unknown keys
 * are ignored and nullable fields tolerate `null`; `normalizePlan` turns this
 * into a strict `StudioPlan`.
 */
export const LlmExtraQuestionSchema = looseObject({
	tempId: nullish(string()),
	title: string(),
	description: nullish(string()),
});

export const LlmSurveySchema = looseObject({
	intro: nullish(string()),
	explanationPages: nullish(array(looseObject({ title: string(), content: string() }))),
	allowParticipantsToAddSuggestions: nullish(boolean()),
	minEvaluationsPerQuestion: nullish(number()),
	askUserForASolutionBeforeEvaluation: nullish(boolean()),
	extraQuestions: nullish(array(LlmExtraQuestionSchema)),
});

/** How the Draft step picks its sources; `normalizePlan` fills the default. */
export const LlmDraftCutoffSchema = looseObject({
	mode: picklist(['chosen', 'topN', 'threshold']),
	n: nullish(number()),
	minConsensus: nullish(number()),
	minEvaluators: nullish(number()),
});

export const LlmActivitySchema = looseObject({
	tempId: nullish(string()),
	type: StudioActivityTypeSchema,
	title: string(),
	description: nullish(string()),
	openNow: nullish(boolean()),
	change: nullish(StudioPlanChangeSchema),
	existingStatementId: nullish(string()),
	role: nullish(picklist(ACTIVITY_ROLES)),
	survey: nullish(LlmSurveySchema),
	/** `document` only: tempIds or existing statementIds of the source activities. */
	draftFrom: nullish(array(string())),
	draftCutoff: nullish(LlmDraftCutoffSchema),
	draftIntent: nullish(string()),
});

export const LlmScheduledActionSchema = looseObject({
	tempId: nullish(string()),
	/** Activity tempId or existing statementId. */
	target: string(),
	action: StudioScheduledActionKindSchema,
	/** ISO-8601 with offset. */
	at: string(),
	nudgeMessage: nullish(string()),
	/** `draft` only; defaults to the target document's `draftFrom`. */
	draftFrom: nullish(array(string())),
});

export const LlmPlanSchema = looseObject({
	mainQuestion: looseObject({ title: string(), description: nullish(string()) }),
	activities: array(LlmActivitySchema),
	scheduledActions: nullish(array(LlmScheduledActionSchema)),
	summary: nullish(string()),
});

export const LlmPlanResponseSchema = looseObject({
	diagnosis: nullish(looseObject({})),
	patternId: nullish(string()),
	missingCritical: nullish(array(string())),
	reply: string(),
	readyToBuild: optional(boolean(), false),
	plan: nullish(LlmPlanSchema),
});

export type LlmPlan = InferOutput<typeof LlmPlanSchema>;
export type LlmPlanResponse = InferOutput<typeof LlmPlanResponseSchema>;
