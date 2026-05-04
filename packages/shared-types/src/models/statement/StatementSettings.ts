import {
	object,
	optional,
	array,
	string,
	boolean,
	enum_,
	picklist,
	InferOutput,
	number,
} from 'valibot';
import { DeliberationType, SortType, ThemeStyle } from '../TypeEnums';

/**
 * Join form — admin-defined contact form shown the first time a user joins
 * any option under a question. Submission is stored once per user per
 * owning question, either in Firestore or appended to a Google Sheet.
 */
export const JoinFormFieldTypeSchema = picklist(['text', 'phone', 'email']);
export type JoinFormFieldType = InferOutput<typeof JoinFormFieldTypeSchema>;

export const JoinFormFieldSchema = object({
	id: string(),       // stable slug used as the form key
	label: string(),    // display label (admin-provided, admin handles translation)
	type: JoinFormFieldTypeSchema,
	required: boolean(),
});
export type JoinFormField = InferOutput<typeof JoinFormFieldSchema>;

export const JoinFormDestinationSchema = picklist(['firestore', 'sheets']);
export type JoinFormDestination = InferOutput<typeof JoinFormDestinationSchema>;

export const JoinFormConfigSchema = object({
	enabled: boolean(),
	fields: array(JoinFormFieldSchema),
	destination: JoinFormDestinationSchema,
	sheetUrl: optional(string()),
	// Language the admin used when saving the form (e.g. 'he', 'en'). The join
	// app renders the modal chrome (title, buttons) in this language so they
	// match the stored field labels regardless of the visitor's browser lang.
	formLanguage: optional(string()),
});
export type JoinFormConfig = InferOutput<typeof JoinFormConfigSchema>;

/**
 * Conditional-joining resolution — lets admins run a one-time "Resolve" step
 * that filters out options below minJoinMembers. Until resolved, every join
 * is a conditional intent ("count me in if this reaches N"). After resolve,
 * surviving options become firm memberships and users with too many intents
 * are prompted to prune to `maxCommitmentsPerUser`.
 */
export const JoinResolutionPhaseSchema = picklist(['intent', 'resolved']);
export type JoinResolutionPhase = InferOutput<typeof JoinResolutionPhaseSchema>;

export const JoinResolutionConfigSchema = object({
	enabled: boolean(),
	phase: JoinResolutionPhaseSchema,
	maxCommitmentsPerUser: number(),
	resolvedAt: optional(number()),
	resolvedBy: optional(string()),
	activatedCount: optional(number()),
	failedCount: optional(number()),
	orphanedCount: optional(number()),
	pruningCount: optional(number()),
});
export type JoinResolutionConfig = InferOutput<typeof JoinResolutionConfigSchema>;

/**
 * Activation threshold — minimum number of activists and organizers
 * required before an option is considered "activated". When enabled,
 * users see how many more people are needed.
 */
export const ActivationThresholdSchema = object({
	enabled: boolean(),
	minActivists: optional(number()),
	minOrganizers: optional(number()),
});
export type ActivationThreshold = InferOutput<typeof ActivationThresholdSchema>;

/**
 * Condensation / "Grouped suggestions" — creates a new sibling statement
 * (with `isCluster: true` and `integratedOptions: [...sourceIds]`) that
 * represents a group of semantically similar originals. Originals are NOT
 * reparented, hidden, or modified — they remain live in the database.
 * Whether voters see them in the UI is controlled per-surface via `visibility`.
 *
 * Evaluations aggregate upward from originals into the cluster via the
 * existing `fn_clusterAggregation` pipeline (deduped per evaluator).
 */
export const CondensationLevelSchema = picklist(['loose', 'balanced', 'tight']);
export type CondensationLevel = InferOutput<typeof CondensationLevelSchema>;

export const CondensationSurfaceVisibilitySchema = picklist(['both', 'clusters-only']);
export type CondensationSurfaceVisibility = InferOutput<typeof CondensationSurfaceVisibilitySchema>;

export const CondensationVisibilitySchema = object({
	main: CondensationSurfaceVisibilitySchema,
	massConsensus: CondensationSurfaceVisibilitySchema,
	join: CondensationSurfaceVisibilitySchema,
});
export type CondensationVisibility = InferOutput<typeof CondensationVisibilitySchema>;

export const CondensationConfigSchema = object({
	enabled: boolean(),
	level: CondensationLevelSchema, // maps to similarity threshold via CONDENSATION_THRESHOLDS
	autoApply: boolean(), // false = creator approves groups via preview before they publish
	allowCreatorOverrides: boolean(),
	minGroupSize: number(), // minimum members required to form a cluster (default 2)
	visibility: CondensationVisibilitySchema, // per-surface display mode
	allowDrillToOriginals: boolean(), // when visibility is clusters-only, can voters drill to see originals
	// Eligibility filters: only options that meet BOTH thresholds are considered
	// for automatic clustering. Creator overrides (drag-drop) bypass these.
	// Undefined or 0 disables the filter.
	minAverageForClustering: optional(number()), // e.g. 0.7 means only cluster options with avg eval >= 0.7
	minEvaluatorsForClustering: optional(number()), // e.g. 3 means only cluster options with >=3 evaluators
});
export type CondensationConfig = InferOutput<typeof CondensationConfigSchema>;

export enum evaluationType {
	likeDislike = 'like-dislike',
	range = 'range',
	singleLike = 'single-like',
	communityVoice = 'community-voice',
}


export const StatementSettingsSchema = object({
	subScreens: optional(array(string())),
	enableAddEvaluationOption: optional(boolean()),
	enableEvaluation: optional(boolean()), // if false, the user cannot evaluate or vote
	enableAddNewSubQuestionsButton: optional(boolean()),
	defaultLookForSimilarities: optional(boolean()),
	isSubmitMode: optional(boolean()), // should a submit button appear in the bottom. it transfer to a thank you page when clicked. It is just used for the user to feel that he finished evaluating.
	enableAddVotingOption: optional(boolean()),
	/** @deprecated Auto-derived from evaluationType. Do not set directly — use evaluationType instead. */
	enhancedEvaluation: optional(boolean()),
	evaluationType: optional(enum_(evaluationType)),
	joiningEnabled: optional(boolean()),
	singleJoinOnly: optional(boolean()), // If true, user can only join ONE option under this parent
	dualRoleJoin: optional(boolean()), // Join app: when true, options expose two buttons (activist + organizer). Default (undefined/false) = single "Join" button.
	minJoinMembers: optional(number()), // Minimum members per option (for visual indicator)
	maxJoinMembers: optional(number()), // Maximum members per option (for visual indicator + split trigger)
	showEvaluation: optional(boolean()),
	// Join app: when undefined or true, every option card renders the join
	// row (Activist / Organizer buttons, or single Join when dualRoleJoin
	// is explicitly false). Set false to hide all join buttons — admins use
	// this for a pure-evaluation round. Default ON ("opt-out") so a fresh
	// question keeps the join experience the participant expects.
	showJoining: optional(boolean()),
	// Join app: when true, every option card renders the results strip
	// (consensus / average / evaluators) regardless of whether the 5-face
	// evaluation row itself is being shown. Independent from showEvaluation
	// so admins can reveal results at a chosen moment in a facilitated session
	// without changing the participant evaluation mode.
	showResults: optional(boolean()),
	inVotingGetOnlyResults: optional(boolean()),
	enableSimilaritiesSearch: optional(boolean()),
	enableNavigationalElements: optional(boolean()),
	show: optional(boolean()),
	deliberationType: optional(enum_(DeliberationType)),
	hasChat: optional(boolean()),
	hasChildren: optional(boolean()),
	numberOfOptionsPerUser: optional(number()),
	enableAIImprovement: optional(boolean()),
	popperianDiscussionEnabled: optional(boolean()),
	popperianPreCheckEnabled: optional(boolean()),
	enableMultiSuggestionDetection: optional(boolean()),
	enableAutoMerge: optional(boolean()), // if true (default), similar proposals will be automatically merged; if false, users choose
	similarityThreshold: optional(number()), // 0-1, default 0.85 - threshold for finding similar options
	excludedInheritedDemographicIds: optional(array(string())), // IDs of inherited demographic questions to exclude for this statement
	enableChatPanel: optional(boolean()), // if false, the chat side panel is hidden (default: true)
	enableSubQuestionsMap: optional(boolean()), // if false, the sub-questions map side panel is hidden (default: true)
	defaultView: optional(string()), // 'chat' | 'options' | 'questions' - default view for the segmented control
	defaultSortType: optional(enum_(SortType)), // default sort for options/suggestions (e.g., 'accepted' for consensus sort)
	enableTreeView: optional(boolean()), // if true, show threaded tree discussion instead of flat chat
	enableResearchLogging: optional(boolean()), // if true, research actions are logged for this statement and all sub-statements
	joinForm: optional(JoinFormConfigSchema), // admin-defined join form shown on first join under this question
	joinResolution: optional(JoinResolutionConfigSchema), // conditional-joining lifecycle (intent → resolved)
	enableHybridClustering: optional(boolean()), // if true, hybrid text+rating clustering runs for this question and sub-questions
	activationThreshold: optional(ActivationThresholdSchema), // min activists/organizers to activate an option
	condensation: optional(CondensationConfigSchema), // grouped suggestions feature — see CondensationConfigSchema
	// Join app: when true, the MainHub renders a QR code section that any
	// participant can use to share the room URL with someone nearby (peer-to-
	// peer invite). Hub-scoped — only honoured on the main statement, not
	// per-question. Admin-controlled via the FacilitatorPanel.
	showQR: optional(boolean()),
	// Join app: seed used when `defaultSortType === SortType.random` so every
	// participant computes the same shuffle locally. Admin re-randomizes by
	// pressing the Random sort button again, which writes a fresh seed.
	randomSortSeed: optional(number()),
	// Join app: visual style family. Each style has its own light + dark
	// palette tuned for legibility (system prefers-color-scheme still drives
	// light vs dark). Default = serious (current earth-tone palette).
	themeStyle: optional(enum_(ThemeStyle)),
});


export type StatementSettings = InferOutput<typeof StatementSettingsSchema>;
