/**
 * @freedi/deliberation-brain — the pure, framework-agnostic brain behind
 * WizCol Studio's "Start a question with AI". No firebase, no network.
 */
export type {
	BrainContext,
	DialogueMove,
	NextMove,
	EngineAffordance,
	ActivityRole,
	ActivityTiming,
	ActivityTemplate,
	PatternPredicate,
	DeliberationPattern,
	PatternMatch,
} from './types';

export { ENGINE_AFFORDANCES, getAffordance } from './affordances';

export {
	PATTERNS,
	DEFAULT_PATTERN_ID,
	getPattern,
	matchPatterns,
	widenConvergeDecide,
	quickPulse,
	budgetAllocation,
	policyConsultation,
	bridgeContestedIssue,
	visionStrategy,
} from './patterns';

export {
	instantiatePattern,
	instantiateActivity,
	fillTemplate,
	describeTopic,
	DEFAULT_SURVEY_CONFIG,
	DEFAULT_NUDGE_MESSAGE,
} from './instantiate';

export { nextMove, MAX_QUESTIONS_PER_TURN, PROPOSE_BY_TURN, CONFIRM_FROM_TURN } from './policy';

export { renderSystemPrompt, renderTurnContext, renderPattern } from './prompt';

export {
	LlmPlanResponseSchema,
	LlmPlanSchema,
	LlmActivitySchema,
	LlmScheduledActionSchema,
	LlmSurveySchema,
	ACTIVITY_ROLES,
} from './schema';
export type { LlmPlan, LlmPlanResponse } from './schema';

export { interpretLlmResponse, normalizePlan, PlanParseError, MIN_LEAD_MS } from './interpret';
export type { InterpretOptions, InterpretedResponse } from './interpret';

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
