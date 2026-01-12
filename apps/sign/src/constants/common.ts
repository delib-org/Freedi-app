/**
 * Common constants for Sign app
 * Avoids magic numbers and provides clear semantics
 */

/**
 * Time constants in milliseconds
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
 * Query limits for Firestore
 */
export const QUERY_LIMITS = {
  PARAGRAPHS: 200,
  COMMENTS: 100,
  SUGGESTIONS: 50,
  INVITATIONS: 50,
  DEFAULT: 50,
  SIGNATURES: 200,
} as const;

/**
 * Animation durations in milliseconds
 */
export const ANIMATION = {
  SIGNING: 600,
  SUCCESS: 1200,
  CONFETTI: 800,
  REJECTING: 500,
  REJECTED: 1000,
  MODAL_TRANSITION: 300,
} as const;

/**
 * Cookie settings
 */
export const COOKIE = {
  MAX_AGE_DAYS: 30,
  MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Viewport tracking settings
 */
export const VIEWPORT_TRACKING = {
  MIN_DURATION_SECONDS: 5,
  THRESHOLD: 0.5,
  DEBOUNCE_MS: 1000,
} as const;

/**
 * Privacy thresholds
 */
export const PRIVACY = {
  MIN_SEGMENT_SIZE: 5,
} as const;

/**
 * UI constants
 */
export const UI = {
  DEBOUNCE_DELAY: 300,
  THROTTLE_DELAY: 100,
  TOAST_DURATION: 3000,
  MODAL_Z_INDEX: 1000,
  TOP_PARAGRAPHS_LIMIT: 10,
} as const;

/**
 * Validation constants
 */
export const VALIDATION = {
  MIN_COMMENT_LENGTH: 1,
  MAX_COMMENT_LENGTH: 5000,
  MIN_QUESTION_TEXT_LENGTH: 3,
  MAX_QUESTION_TEXT_LENGTH: 500,
} as const;

/**
 * Suggestion feature constants
 */
export const SUGGESTIONS = {
  MIN_LENGTH: 10,
  MAX_LENGTH: 5000,
  MAX_REASONING_LENGTH: 1000,
  POST_COMMENT_PROMPT_DELAY_MS: 500,
  AUTO_DISMISS_DELAY_MS: 5000,
  REALTIME_POLL_INTERVAL_MS: 5000,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  GENERIC: 'An unexpected error occurred. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  AUTHENTICATION: 'Please sign in to continue.',
  AUTHORIZATION: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SEGMENT_TOO_SMALL: 'This segment has fewer than 5 respondents (privacy threshold).',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  SIGNATURE_SUBMITTED: 'Your signature has been submitted.',
  COMMENT_POSTED: 'Comment posted successfully.',
  SETTINGS_SAVED: 'Settings saved successfully.',
} as const;

/**
 * API routes
 */
export const API_ROUTES = {
  DEMOGRAPHICS_STATUS: (documentId: string) => `/api/demographics/status/${documentId}`,
  DEMOGRAPHICS_QUESTIONS: (documentId: string) => `/api/demographics/questions/${documentId}`,
  DEMOGRAPHICS_ANSWERS: (documentId: string) => `/api/demographics/answers/${documentId}`,
  HEATMAP: (documentId: string) => `/api/heatmap/${documentId}`,
  HEATMAP_DEMOGRAPHICS: (documentId: string) => `/api/heatmap/${documentId}/demographics`,
  COMMENTS: (paragraphId: string) => `/api/comments/${paragraphId}`,
  SUGGESTIONS: (paragraphId: string) => `/api/suggestions/${paragraphId}`,
  SUGGESTION_EVALUATIONS: (suggestionId: string) => `/api/suggestion-evaluations/${suggestionId}`,
  APPROVAL: '/api/approval',
  SIGNATURE: '/api/signature',
} as const;
