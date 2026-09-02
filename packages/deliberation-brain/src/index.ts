/**
 * @freedi/deliberation-brain — the pure, framework-agnostic brain behind
 * WizCol Studio's "Start a question with AI". No firebase, no network.
 * The playbook it implements is PLAYBOOK.md.
 */
export type {
	BrainContext,
	DialogueMove,
	NextMove,
	EngineAffordance,
	ActivityRole,
	ActivityTiming,
	ActivityTemplate,
	TemplateSkipRule,
	PatternPredicate,
	DeliberationPattern,
	PatternMatch,
} from './types';

export {
	ENGINE_AFFORDANCES,
	DRAFT_STEP_DESCRIPTION,
	EXPERIMENTAL_ENGINES_NOTE,
	getAffordance,
} from './affordances';

export {
	PATTERNS,
	DEFAULT_PATTERN_ID,
	getPattern,
	matchPatterns,
	questionFirstAgreement,
	draftFirstAgreement,
	materialFirstAgreement,
	bridgeContestedIssue,
	budgetAllocation,
	quickPulse,
} from './patterns';

export {
	instantiatePattern,
	instantiateActivity,
	scheduleWindow,
	scheduleDraftedDocument,
	finalizeActions,
	fillTemplate,
	describeTopic,
	DEFAULT_SURVEY_CONFIG,
	DEFAULT_NUDGE_MESSAGE,
	DEFAULT_SEGMENT,
	DRAFT_REVIEW_DAYS,
} from './instantiate';
export type { ActionDraft, PlacedActivity } from './instantiate';

export { nextMove, MAX_QUESTIONS_PER_TURN, PROPOSE_BY_TURN, CONFIRM_FROM_TURN } from './policy';

export { renderSystemPrompt, renderTurnContext, renderPattern } from './prompt';
export { OUTPUT_CONTRACT } from './promptContract';

export {
	LlmPlanResponseSchema,
	LlmPlanSchema,
	LlmActivitySchema,
	LlmScheduledActionSchema,
	LlmSurveySchema,
	LlmDraftCutoffSchema,
	ACTIVITY_ROLES,
} from './schema';
export type { LlmPlan, LlmPlanResponse } from './schema';

export { interpretLlmResponse, normalizePlan, PlanParseError, MIN_LEAD_MS } from './interpret';
export type { InterpretOptions, InterpretedResponse } from './interpret';

export { applyDraftRules, normalizeCutoff, resolveSources } from './normalizeDraft';
export type { DraftRuleContext } from './normalizeDraft';

export { critiquePlan, looksLikeOpenQuestion, RECOMMENDED_MAX_ACTIVITIES } from './critic';
export type { CriticReport, CriticContext } from './critic';

export {
	mergeDiagnosis,
	sanitizeDiagnosis,
	missingCriticalFields,
	isFieldKnown,
	CRITICAL_FIELDS,
	CONFIDENCE_THRESHOLD,
} from './diagnosis';

export { plansEqual, computeProposalDiff, stableStringify } from './learning';

export { buildFixtureResponse } from './fixture';
export type { FixtureResult } from './fixture';

export { addDays, localDateTimeToMs, toOffsetIso, isoDateInTimezone, parseIsoDate } from './time';

export { BRAIN_VERSION } from './version';
