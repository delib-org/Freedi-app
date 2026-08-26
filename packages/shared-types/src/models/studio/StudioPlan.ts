import {
	InferOutput,
	array,
	boolean,
	number,
	object,
	optional,
	picklist,
	record,
	string,
} from 'valibot';
import { QuestionStatusSchema } from '../statement/StatementSettings';
import { ChallengeDiagnosisSchema } from './ChallengeDiagnosis';

/**
 * "Start a question with AI" — the plan an admin negotiates with the AI
 * consultant in WizCol Studio, and the session that holds the conversation.
 *
 * Activity vocabulary is Studio's (consultant-facing), not the engines':
 *   crowdSurvey → Mass Consensus survey, liveSession → Join, discussion → main app.
 * The build step (`fn_studioPlanBuild`) maps these onto `OrgStatementKind`.
 *
 * All documents here are written exclusively by Cloud Functions; the Studio
 * app only reads them (`studioPlanSessions/{sessionId}`).
 */

export const StudioActivityTypeSchema = picklist(['crowdSurvey', 'liveSession', 'discussion']);
export type StudioActivityType = InferOutput<typeof StudioActivityTypeSchema>;

/** How an activity in the plan relates to what already exists (existing-question mode). */
export const StudioPlanChangeSchema = picklist(['add', 'keep', 'update']);
export type StudioPlanChange = InferOutput<typeof StudioPlanChangeSchema>;

export const StudioScheduledActionKindSchema = picklist(['open', 'freeze', 'close', 'nudge']);
export type StudioScheduledActionKind = InferOutput<typeof StudioScheduledActionKindSchema>;

export const StudioPlanExtraQuestionSchema = object({
	tempId: string(),
	title: string(),
	description: optional(string()),
});
export type StudioPlanExtraQuestion = InferOutput<typeof StudioPlanExtraQuestionSchema>;

/** Crowd-survey configuration the build step turns into an MC `Survey`. */
export const StudioPlanSurveyConfigSchema = object({
	/** Welcome text → `survey.customIntroText` (with `showIntro: true`). */
	intro: optional(string()),
	/** Extra explanation pages shown before the questions (markdown content). */
	explanationPages: optional(array(object({ title: string(), content: string() }))),
	allowParticipantsToAddSuggestions: optional(boolean()),
	minEvaluationsPerQuestion: optional(number()),
	askUserForASolutionBeforeEvaluation: optional(boolean()),
	/** Additional questions in the same survey (created as children of the activity). */
	extraQuestions: optional(array(StudioPlanExtraQuestionSchema)),
});
export type StudioPlanSurveyConfig = InferOutput<typeof StudioPlanSurveyConfigSchema>;

export const StudioPlanActivitySchema = object({
	tempId: string(),
	type: StudioActivityTypeSchema,
	/** Participant-facing question text. */
	title: string(),
	/** Short explanation for participants (≤ 2 sentences). */
	description: optional(string()),
	order: number(),
	/** true → created `live`; false → created `frozen` until a scheduled/manual open. */
	openNow: boolean(),
	/** The role this activity plays in the sequence (from the playbook). */
	role: optional(picklist(['widen', 'measure', 'converge', 'deepen', 'decide', 'ratify'])),
	survey: optional(StudioPlanSurveyConfigSchema),
	/** Existing-question mode: the child statement this row refers to. */
	existingStatementId: optional(string()),
	change: StudioPlanChangeSchema,
});
export type StudioPlanActivity = InferOutput<typeof StudioPlanActivitySchema>;

export const StudioPlanScheduledActionSchema = object({
	tempId: string(),
	/** Exactly one of `activityTempId` | `statementId` is set. */
	activityTempId: optional(string()),
	statementId: optional(string()),
	action: StudioScheduledActionKindSchema,
	/** Epoch ms (normalized from the ISO string the model emitted). */
	at: number(),
	/** The original ISO-8601 string with offset, for display/debugging. */
	atLocal: optional(string()),
	/** `nudge` only. */
	nudgeMessage: optional(string()),
});
export type StudioPlanScheduledAction = InferOutput<typeof StudioPlanScheduledActionSchema>;

export const StudioPlanSchema = object({
	mainQuestion: object({ title: string(), description: optional(string()) }),
	activities: array(StudioPlanActivitySchema),
	scheduledActions: array(StudioPlanScheduledActionSchema),
	/** Rationale for the admin, in their language. */
	summary: string(),
});
export type StudioPlan = InferOutput<typeof StudioPlanSchema>;

export const StudioPlanMessageSchema = object({
	role: picklist(['user', 'assistant']),
	content: string(),
	createdAt: number(),
	/** Assistant turns: the plan version this reply produced. */
	planVersion: optional(number()),
});
export type StudioPlanMessage = InferOutput<typeof StudioPlanMessageSchema>;

export const StudioPlanSessionStatusSchema = picklist([
	'draft',
	'ready',
	'building',
	'built',
	'failed',
]);
export type StudioPlanSessionStatus = InferOutput<typeof StudioPlanSessionStatusSchema>;

/** Snapshot of an existing activity, shown to the model in existing-question mode. */
export const StudioExistingActivitySnapshotSchema = object({
	statementId: string(),
	type: StudioActivityTypeSchema,
	title: string(),
	description: optional(string()),
	order: number(),
	status: optional(QuestionStatusSchema),
	surveyId: optional(string()),
});
export type StudioExistingActivitySnapshot = InferOutput<
	typeof StudioExistingActivitySnapshotSchema
>;

export const StudioPlanBuildResultSchema = object({
	topQuestionId: string(),
	/** tempId → statementId (also the idempotency map for retries). */
	activityIds: record(string(), string()),
	surveyIds: array(string()),
	scheduledActionIds: array(string()),
	completedAt: optional(number()),
});
export type StudioPlanBuildResult = InferOutput<typeof StudioPlanBuildResultSchema>;

/** What the admin changed between the last AI proposal and what was built. */
export const StudioProposalDiffSchema = object({
	activitiesAdded: number(),
	activitiesRemoved: number(),
	activitiesEdited: number(),
	actionsChanged: number(),
	mainQuestionEdited: boolean(),
});
export type StudioProposalDiff = InferOutput<typeof StudioProposalDiffSchema>;

export const StudioPlanRatingSchema = object({
	value: picklist(['up', 'down']),
	note: optional(string()),
	ratedAt: number(),
});
export type StudioPlanRating = InferOutput<typeof StudioPlanRatingSchema>;

/** Participation outcome captured ~30 days after build (learning loop). */
export const StudioPlanOutcomeSchema = object({
	snapshotAt: number(),
	entered: number(),
	suggested: number(),
	evaluated: number(),
	options: number(),
	evaluations: number(),
	activitiesTotal: number(),
	activitiesClosed: number(),
});
export type StudioPlanOutcome = InferOutput<typeof StudioPlanOutcomeSchema>;

/** Stored at `studioPlanSessions/{sessionId}`. */
export const StudioPlanSessionSchema = object({
	sessionId: string(),
	organizationId: string(),
	organizationName: string(),
	/** Existing-question mode: the top question being extended. */
	topQuestionId: optional(string()),
	existingActivities: optional(array(StudioExistingActivitySnapshotSchema)),
	createdBy: string(),
	/** ISO 639-1 of the admin's latest message (last confident detection). */
	language: string(),
	/** Studio UI language at session start. */
	uiLanguage: string(),
	/** IANA timezone from the admin's browser. */
	timezone: string(),
	status: StudioPlanSessionStatusSchema,
	messages: array(StudioPlanMessageSchema),
	diagnosis: optional(ChallengeDiagnosisSchema),
	/** Playbook pattern the plan is based on. */
	patternId: optional(string()),
	currentPlan: optional(StudioPlanSchema),
	planVersion: number(),
	readyToBuild: boolean(),
	userTurns: number(),
	/** Learning loop: last AI proposal vs what was actually built. */
	proposedPlan: optional(StudioPlanSchema),
	builtPlan: optional(StudioPlanSchema),
	proposalDiff: optional(StudioProposalDiffSchema),
	rating: optional(StudioPlanRatingSchema),
	outcome: optional(StudioPlanOutcomeSchema),
	build: optional(StudioPlanBuildResultSchema),
	buildStartedAt: optional(number()),
	buildError: optional(string()),
	builtStatementId: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});
export type StudioPlanSession = InferOutput<typeof StudioPlanSessionSchema>;

export const STUDIO_PLAN_MAX_ACTIVITIES = 6;
export const STUDIO_PLAN_MAX_SCHEDULED_ACTIONS = 20;
export const STUDIO_PLAN_MAX_USER_TURNS = 40;
export const STUDIO_PLAN_MAX_MESSAGE_CHARS = 4000;
export const STUDIO_PLAN_MESSAGES_PER_HOUR = 30;
export const STUDIO_NUDGE_MESSAGE_MAX = 280;
/** Days after build when the outcome snapshot is taken. */
export const STUDIO_PLAN_OUTCOME_DELAY_DAYS = 30;
