/**
 * Common Constants
 *
 * Centralized constants to replace magic numbers throughout the codebase.
 */

/**
 * Time constants (in milliseconds)
 */
export const TIME = {
	SECOND: 1000,
	MINUTE: 60 * 1000,
	HOUR: 60 * 60 * 1000,
	DAY: 24 * 60 * 60 * 1000,
	WEEK: 7 * 24 * 60 * 60 * 1000,
	MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Firebase constants
 */
export const FIREBASE = {
	BATCH_SIZE: 500,
	MAX_TRANSACTION_RETRIES: 3,
	QUERY_LIMIT_DEFAULT: 50,
	QUERY_LIMIT_MAX: 100,
} as const;

/**
 * Retry configuration
 */
export const RETRY = {
	MAX_ATTEMPTS: 4,
	INITIAL_DELAY_MS: 2000,
	MAX_DELAY_MS: 16000,
	EXPONENTIAL_BASE: 2,
} as const;

/**
 * Notification constants
 */
export const NOTIFICATION = {
	TOKEN_REFRESH_INTERVAL: 30 * TIME.DAY,
	TOKEN_CHECK_INTERVAL: 24 * TIME.HOUR,
	SERVICE_WORKER_TIMEOUT: 10 * TIME.SECOND,
	CHECK_INTERVAL: 500,
} as const;

/**
 * UI constants
 */
export const UI = {
	DEBOUNCE_DELAY: 300,
	THROTTLE_DELAY: 1000,
	ANIMATION_DURATION: 200,
	MODAL_Z_INDEX: 1000,
	TOOLTIP_DELAY: 500,
	// Minimum gap between two animated list reorders. Live evaluation updates
	// can reshuffle a consensus ranking many times a second; coalescing them
	// keeps the FLIP glide followable and stops the measure-storm that used to
	// freeze mobile during active deliberation.
	REORDER_THROTTLE_DELAY: 1200,
} as const;

/**
 * Validation constants
 */
export const VALIDATION = {
	MIN_STATEMENT_LENGTH: 2,
	MIN_TITLE_LENGTH: 3,
	MAX_STATEMENT_LENGTH: 1000,
	MAX_DESCRIPTION_LENGTH: 5000,
	MIN_PASSWORD_LENGTH: 8,
} as const;

/**
 * Joining/Room constants
 */
export const JOINING = {
	DEFAULT_MIN_MEMBERS: 3,
	DEFAULT_MAX_MEMBERS: 10,
	MIN_ROOM_SIZE: 2,
} as const;

/**
 * Cache constants
 */
export const CACHE = {
	DEFAULT_TTL: 5 * TIME.MINUTE,
	LONG_TTL: 1 * TIME.HOUR,
	SHORT_TTL: 1 * TIME.MINUTE,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
	GENERIC: 'An unexpected error occurred. Please try again.',
	NETWORK: 'Network error. Please check your connection and try again.',
	AUTHENTICATION: 'Please sign in to continue.',
	AUTHORIZATION: 'You do not have permission to perform this action.',
	VALIDATION: 'Please check your input and try again.',
	NOT_FOUND: 'The requested resource was not found.',
	TIMEOUT: 'The operation timed out. Please try again.',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
	STATEMENT_CREATED: 'Statement created successfully',
	STATEMENT_UPDATED: 'Statement updated successfully',
	STATEMENT_DELETED: 'Statement deleted successfully',
	EVALUATION_SAVED: 'Evaluation saved successfully',
	SETTINGS_SAVED: 'Settings saved successfully',
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
	USER_PREFERENCES: 'userPreferences',
	THEME: 'theme',
	LANGUAGE: 'language',
	AUTH_TOKEN: 'authToken',
	LAST_VISITED: 'lastVisited',
	PWA_USER_RESPONDED: 'pwa-user-responded',
	PWA_INSTALL_TRIGGER_DATA: 'pwa-install-trigger-data',
	PWA_INSTALL_SOFT_PROMPT_DISMISSED_AT: 'pwa-install-soft-prompt-dismissed-at',
	NOTIFICATION_SOFT_PROMPT_DISMISSED_AT: 'notification-soft-prompt-dismissed-at',
	SHOW_HIDDEN_CARDS: 'freedi_showHiddenCards',
} as const;

/**
 * Route paths
 */
export const ROUTES = {
	HOME: '/',
	LOGIN: '/login-first',
	STATEMENT: '/statement',
	MY_SUGGESTIONS: '/my-suggestions',
	PROFILE: '/my',
	MASS_CONSENSUS: '/mass-consensus',
} as const;

/**
 * Chat constants
 */
export const CHAT = {
	INITIAL_MESSAGES_LIMIT: 30,
	LOAD_MORE_BATCH_SIZE: 30,
} as const;

/**
 * Home screen constants
 */
export const HOME = {
	/** Subscriptions loaded by the home listeners on first paint */
	INITIAL_SUBSCRIPTIONS_LIMIT: 30,
	/** Older subscriptions fetched per scroll-to-bottom batch */
	LOAD_MORE_BATCH_SIZE: 30,
} as const;

/**
 * Redux state management constants
 */
export const REDUX = {
	/**
	 * Maximum statements to keep in Redux store before pruning.
	 * Pruning is tree-granular and never evicts trees holding a fully
	 * bulk-loaded scope (see pruneStatements in statementsSlice).
	 */
	MAX_STATEMENTS: 500,
} as const;

/**
 * Bulk "Load all statements" constants (getBulkStatements endpoint + delta listeners)
 */
export const BULK_LOAD = {
	/** Statements fetched per HTTP page */
	PAGE_SIZE: 500,
	/** Watermark safety overlap — delta listeners rewind this far to absorb cache/clock gaps */
	DELTA_OVERLAP_MS: 5000,
	/** Minimum interval between count() aggregation refreshes */
	COUNT_REFRESH_MS: 60000,
	/** How long the "All statements loaded" confirmation stays visible */
	DONE_BANNER_HIDE_MS: 4000,
} as const;

/**
 * Follow Me feature constants
 */
export const FOLLOW_ME = {
	WRITE_DEBOUNCE_MS: 1000,
	REDIRECT_DELAY_MS: 300,
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
	ENABLE_ANALYTICS: true,
	ENABLE_SENTRY: true,
	ENABLE_PWA: true,
	ENABLE_NOTIFICATIONS: true,
} as const;

/**
 * PWA Install Prompt Configuration
 */
export const PWA = {
	/** Minimum number of options user must create before showing install prompt */
	MIN_OPTIONS_FOR_PROMPT: 5,
	/** Whether to show prompt after creating first group/statement */
	SHOW_AFTER_GROUP_CREATION: true,
	/** Delay before showing prompt after trigger condition is met (in ms) */
	PROMPT_DELAY: 2 * TIME.SECOND,
	/** How long to wait before allowing prompt to show again after dismissal (in days) */
	PROMPT_COOLDOWN: 7,
} as const;

/**
 * PWA Install Prompt Messages
 */
export const PWA_MESSAGES = {
	TITLE: 'Install FreeDi',
	DESCRIPTION:
		'Install FreeDi on your device for a better experience. Get quick access and work offline!',
	INSTALL_BUTTON: 'Install',
	CANCEL_BUTTON: 'Not now',
	SUCCESS: 'FreeDi installed successfully!',
} as const;

/**
 * Condensation / Grouped Suggestions — cosine-similarity thresholds for
 * complete-linkage clustering. Calibrated empirically against
 * `text-embedding-3-small` on thematically cohesive short text. The pipeline
 * reads its own copy of this map (see functions/src/condensation/pipeline.ts)
 * so keep the two in sync if you tune these.
 */
export const CONDENSATION_THRESHOLDS = {
	loose: 0.82, // bigger groups, fewer singletons
	balanced: 0.85, // middle ground (default)
	tight: 0.88, // tighter cohesion, more singletons
} as const;

export type CondensationLevelKey = keyof typeof CONDENSATION_THRESHOLDS;

/**
 * Condensation pipeline constants
 */
export const CONDENSATION = {
	/** Default minimum members required to form a cluster */
	MIN_GROUP_SIZE_DEFAULT: 2,
	/** Per-run cap on Gemini merge calls (cost gating) */
	MAX_MERGES_PER_RUN: 25,
	/** Jaccard overlap threshold above which a newly-produced group is matched
	 *  to an existing cluster statement (update in place) rather than creating
	 *  a new one. Below this, a new cluster is created. */
	RECONCILER_JACCARD_THRESHOLD: 0.5,
	/** Lock TTL for the `statements/{parentId}/locks/condensation` doc */
	LOCK_TTL_MS: 5 * TIME.MINUTE,
	/** Chunk size for batched `where(documentId(), 'in', ...)` queries when
	 *  fetching cluster members on drill-down expansion */
	DRILL_BATCH_SIZE: 30,
	/** Scheduler cadence (piggybacks on the existing hybrid-clustering sweep) */
	SCHEDULER_INTERVAL_MS: 15 * TIME.MINUTE,
	/** Centroid-shift threshold that must be exceeded to regenerate a cluster
	 *  title when `titleLockedByCreator` is false */
	TITLE_REGEN_CENTROID_SHIFT: 0.1,
} as const;

/**
 * Per-surface visibility defaults for newly enabled condensation. Matches
 * the UX spec: main + MC default to "both", join defaults to "clusters-only".
 */
export const CONDENSATION_VISIBILITY_DEFAULTS = {
	main: 'both',
	massConsensus: 'both',
	join: 'clusters-only',
} as const;
