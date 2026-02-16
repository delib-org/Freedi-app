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
