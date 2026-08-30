import type {
	ChallengeDiagnosis,
	DiagnosisField,
	StudioActivityType,
	StudioDraftCutoff,
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

/**
 * The playbook grammar: GENERATE (widen/measure) → DRAFT (write) → COMMENT
 * (document) → CONVERGE (live session) → DECIDE / RATIFY (a vote in Main).
 * `write` is only used on `draft` actions / documents before review.
 */
export type ActivityRole =
	| 'widen'
	| 'measure'
	| 'converge'
	| 'deepen'
	| 'decide'
	| 'ratify'
	| 'comment'
	| 'write';

export interface ActivityTiming {
	/** Days after today when the activity starts (default 0). */
	startAfterDays?: number;
	/**
	 * Days after the END of the previous activity in the sequence (wins over
	 * `startAfterDays`). Lets a chain stay consistent when a drafted document's
	 * dates are derived from its sources.
	 */
	startAfterPrevious?: number;
	/** How long it stays open; a `close` action is scheduled at the end. */
	durationDays?: number;
	/** A `nudge` action this many days before the close. */
	nudgeDaysBeforeClose?: number;
}

/** A step is left out of the instantiated plan when the rule matches. */
export interface TemplateSkipRule {
	field: DiagnosisField;
	/** Skip when the diagnosis value is one of these. */
	oneOf?: readonly string[];
	/** Numeric fields only: skip when the value is below this. */
	below?: number;
}

export interface ActivityTemplate {
	role: ActivityRole;
	engine: StudioActivityType;
	/** May contain the `{{topic}}`, `{{organization}}` and `{{segment}}` slots. */
	questionTemplate: string;
	descriptionTemplate?: string;
	/**
	 * Drafted documents are always created hidden (the Draft step writes them,
	 * the admin reviews, an `open` action follows); a document whose text
	 * already exists opens now.
	 */
	openNow: boolean;
	timing: ActivityTiming;
	survey?: Partial<StudioPlanSurveyConfig>;
	/** `document` only: indices of the source steps in the same sequence. */
	draftFrom?: number[];
	/** `document` only: draft from the existing activities (existing-question mode). */
	draftFromExisting?: boolean;
	draftCutoff?: StudioDraftCutoff;
	/** `document` only: what the draft should be (same slots as the question). */
	draftIntentTemplate?: string;
	/** One copy per `audienceSegments` entry (a single copy when there are none). */
	perSegment?: boolean;
	skipWhen?: TemplateSkipRule;
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
