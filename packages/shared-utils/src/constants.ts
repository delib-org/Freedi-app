/**
 * Shared Constants
 *
 * Centralized constants to replace magic numbers across all Freedi apps.
 * Only constants that are truly shared across multiple apps belong here.
 * App-specific constants (UI layout, route paths, etc.) should remain
 * in each app's own constants module.
 */

/**
 * Time constants in milliseconds.
 */
export const TIME = {
	SECOND: 1_000,
	MINUTE: 60 * 1_000,
	HOUR: 60 * 60 * 1_000,
	DAY: 24 * 60 * 60 * 1_000,
	WEEK: 7 * 24 * 60 * 60 * 1_000,
	MONTH: 30 * 24 * 60 * 60 * 1_000,
} as const;

/**
 * Firebase operation limits.
 */
export const FIREBASE = {
	BATCH_SIZE: 500,
	MAX_TRANSACTION_RETRIES: 3,
	QUERY_LIMIT_DEFAULT: 50,
	QUERY_LIMIT_MAX: 100,
} as const;

/**
 * Retry configuration defaults.
 */
export const RETRY = {
	MAX_ATTEMPTS: 4,
	INITIAL_DELAY_MS: 2_000,
	MAX_DELAY_MS: 16_000,
	EXPONENTIAL_BASE: 2,
} as const;

/**
 * Cache TTL constants.
 */
export const CACHE = {
	DEFAULT_TTL: 5 * TIME.MINUTE,
	LONG_TTL: 1 * TIME.HOUR,
	SHORT_TTL: 1 * TIME.MINUTE,
} as const;

/**
 * Generic validation constants shared across apps.
 */
export const VALIDATION = {
	MIN_STATEMENT_LENGTH: 2,
	MIN_TITLE_LENGTH: 3,
	MAX_STATEMENT_LENGTH: 1_000,
	MAX_DESCRIPTION_LENGTH: 5_000,
	MIN_PASSWORD_LENGTH: 8,
} as const;

/**
 * Standard error messages for user-facing feedback.
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
