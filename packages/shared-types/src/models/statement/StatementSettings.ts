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
 * Question status — facilitator-controlled lifecycle gate.
 *  - 'live'   : normal operation (default when unset).
 *  - 'frozen' : the question is visible but no one can join, un-join, or
 *               submit/change evaluations. Read-only snapshot of the room.
 *  - 'closed' : participants see only a "This question is closed" screen
 *               instead of the question content.
 *
 * Used by the Join app's FacilitatorPanel. Admins can flip between states
 * at any time; closing then reopening preserves all existing data.
 */
export const QuestionStatusSchema = picklist(['live', 'frozen', 'closed']);
export type QuestionStatus = InferOutput<typeof QuestionStatusSchema>;

/**
 * Activation threshold — minimum number of activists and organizers
 * required before an option is considered "activated". When enabled,
 * users see how many more people are needed.
 *
 * `maxJoinsPerUser` (optional) caps how many sibling options a single
 * participant may join as activist under this question. When the user
 * tries to join past the cap, the join app prompts them to swap out one
 * existing membership for the new one. 0 / undefined disables the cap.
 */
export const ActivationThresholdSchema = object({
	enabled: boolean(),
	minActivists: optional(number()),
	minOrganizers: optional(number()),
	maxJoinsPerUser: optional(number()),
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

/**
 * The three independent "View layers" toggles on the Solutions tab. Composing
 * them yields the named states (All / Raw only / Synth+Raw / Clusters / Synth
 * only). Stored as the admin default; per-user overrides live in localStorage.
 */
export const ViewLayersSchema = object({
	raw: boolean(), // show raw participant ideas
	synth: boolean(), // show AI-synthesized proposals
	cluster: boolean(), // group into topic-cluster cards (synth + raw nested)
});
export type ViewLayers = InferOutput<typeof ViewLayersSchema>;

export const CondensationConfigSchema = object({
	enabled: boolean(),
	level: CondensationLevelSchema, // maps to similarity threshold via CONDENSATION_THRESHOLDS
	autoApply: boolean(), // false = creator approves groups via preview before they publish
	allowCreatorOverrides: boolean(),
	minGroupSize: number(), // minimum members required to form a cluster (default 2)
	visibility: CondensationVisibilitySchema, // per-surface display mode
	allowDrillToOriginals: boolean(), // when visibility is clusters-only, can voters drill to see originals
	// Admin-set default for the Solutions "View layers" toggles (Raw / Synth /
	// Cluster). Each user can override locally (localStorage); this is the
	// fallback everyone lands on. Optional → falls back to all-on ("All").
	viewLayers: optional(ViewLayersSchema),
	// Eligibility filters: only options that meet BOTH thresholds are considered
	// for automatic clustering. Creator overrides (drag-drop) bypass these.
	// Undefined or 0 disables the filter.
	minAverageForClustering: optional(number()), // e.g. 0.7 means only cluster options with avg eval >= 0.7
	minEvaluatorsForClustering: optional(number()), // e.g. 3 means only cluster options with >=3 evaluators
});
export type CondensationConfig = InferOutput<typeof CondensationConfigSchema>;

/**
 * Idea Synthesis — bulk near-duplicate detection across all options under a
 * question. Distinct from topic clustering (broad themes) and condensation
 * (UMAP/DBSCAN re-grouping). Produces verified-same merge groups via
 * embedding ANN + LLM-as-judge (four-way verdict: same/related/different/
 * opposite). Resulting merged statements use the existing isCluster=true +
 * integratedOptions[] data model so render and aggregation paths are shared.
 *
 * See docs/clusters and synthesis/clustering-and-synthesis-paper.md §5 for the full method.
 *
 * All fields optional — synthesis is admin-triggered and does not run unless
 * settings are present and `enabled` is true.
 */
export const SynthesisConfigSchema = object({
	enabled: optional(boolean()), // master switch for the synthesis admin button
	defaultThreshold: optional(number()), // cosine candidate threshold, default 0.90
	// Eligibility filters applied BEFORE any embedding op. Undefined disables.
	minAverageForSynthesis: optional(number()),
	minConsensusForSynthesis: optional(number()), // new filter requested for synthesis flow
	minEvaluatorsForSynthesis: optional(number()),
});
export type SynthesisConfig = InferOutput<typeof SynthesisConfigSchema>;

/**
 * Cluster-map display settings — admin-controlled rendering of the radial
 * cluster board (ClusterBoard). Persisted on the question so every viewer sees
 * the same map. All fields optional → the board falls back to its built-in
 * defaults (see ClusterBoard MAP_FONT_* / MAP_SYNTH_VISIBILITY_DEFAULT).
 */
export const MapSynthVisibilitySchema = picklist([
	'all', // clusters/synth AND ungrouped originals (default)
	'clusters-only', // only clustered/synth groups; hide the ungrouped block
	'originals-only', // flatten everything to originals; hide cluster grouping
]);
export type MapSynthVisibility = InferOutput<typeof MapSynthVisibilitySchema>;

export const MapSettingsSchema = object({
	cardFontRem: optional(number()), // sticky-note (card) text size, rem
	clusterFontRem: optional(number()), // cluster pill + hub title size, rem
	synthVisibility: optional(MapSynthVisibilitySchema), // which layers render
	showProvenance: optional(boolean()), // show "made from N responses" on clusters
});
export type MapSettings = InferOutput<typeof MapSettingsSchema>;

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
	synthesis: optional(SynthesisConfigSchema), // bulk idea synthesis — see SynthesisConfigSchema
	map: optional(MapSettingsSchema), // cluster-map display controls — see MapSettingsSchema
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
	// Join app: facilitator-controlled lifecycle gate. Default (undefined) is
	// treated as 'live'. 'frozen' blocks joining/un-joining/evaluation while
	// still showing the question; 'closed' replaces the question with a
	// "This question is closed" screen.
	questionStatus: optional(QuestionStatusSchema),
});


export type StatementSettings = InferOutput<typeof StatementSettingsSchema>;
