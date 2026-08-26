import type {
	ChallengeDiagnosis,
	DiagnosisField,
	StudioActivityType,
	StudioExistingActivitySnapshot,
	StudioPlan,
	StudioPlanSurveyConfig,
} from '@freedi/shared-types';

/** Everything the brain knows about the conversation at the current turn. */
export interface BrainContext {
	mode: 'new' | 'existing';
	/** Language for the reply + participant-facing text, e.g. 'Hebrew'. */
	languageName: string;
	/** 'YYYY-MM-DD' in the admin's timezone. */
	todayIso: string;
	/** IANA timezone, e.g. 'Asia/Jerusalem'. */
	timezone: string;
	organizationName: string;
	existingActivities?: StudioExistingActivitySnapshot[];
	diagnosis?: ChallengeDiagnosis;
	currentPlan?: StudioPlan;
	patternId?: string;
	/** User turns BEFORE the current one (0 on the first message). */
	userTurns: number;
	/** Critic problems from the previous plan, to repair this turn. */
	problems?: string[];
}

export type DialogueMove = 'askClarifying' | 'propose' | 'revise' | 'confirm';

export interface NextMove {
	move: DialogueMove;
	/** At most 2 diagnosis fields to ask about this turn. */
	askFields: DiagnosisField[];
	reason: string;
}

/** Consultant-vocabulary card for one engine (never the app names). */
export interface EngineAffordance {
	engine: StudioActivityType;
	label: string;
	icon: string;
	bestFor: string;
	audience: string;
	cadence: string;
	measures: string;
	notFor: string;
}

export type ActivityRole = 'widen' | 'measure' | 'converge' | 'deepen' | 'decide' | 'ratify';

export interface ActivityTiming {
	/** Days after today when the activity starts (default 0). */
	startAfterDays?: number;
	/** How long it stays open; a `close` action is scheduled at the end. */
	durationDays?: number;
	/** A `nudge` action this many days before the close. */
	nudgeDaysBeforeClose?: number;
}

export interface ActivityTemplate {
	role: ActivityRole;
	engine: StudioActivityType;
	/** May contain the `{{topic}}` and `{{organization}}` slots. */
	questionTemplate: string;
	descriptionTemplate?: string;
	openNow: boolean;
	timing: ActivityTiming;
	survey?: Partial<StudioPlanSurveyConfig>;
}

/**
 * Scores `weight` when `diagnosis[field]` ∈ `oneOf` (or is simply set when
 * `oneOf` is omitted). For numeric fields `max` scores when value ≤ max.
 */
export interface PatternPredicate {
	field: DiagnosisField;
	oneOf?: readonly string[];
	/** Numeric fields only (timeHorizonDays): matches when value ≤ max. */
	max?: number;
	weight: number;
	note?: string;
}

export interface DeliberationPattern {
	patternId: string;
	name: string;
	summary: string;
	applicability: PatternPredicate[];
	sequence: ActivityTemplate[];
	rationale: string;
	risks: string[];
	successSignals: string[];
	/** Optional main-question template (same slots as activities). */
	mainQuestionTemplate?: string;
}

export interface PatternMatch {
	pattern: DeliberationPattern;
	score: number;
	reasons: string[];
}
