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
 * Firebase-specific limits
 */
export const FIREBASE = {
  /** Maximum items in a Firestore 'in' query */
  IN_QUERY_LIMIT: 30,
  /** Maximum items in a batch write */
  BATCH_SIZE: 500,
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
 * Document versioning constants
 */
export const VERSIONING = {
  /** Default multiplier for suggestions/comments impact */
  DEFAULT_K1: 5,
  /** Default multiplier for support/objection impact */
  DEFAULT_K2: 3,
  /** Default minimum impact threshold */
  DEFAULT_MIN_IMPACT_THRESHOLD: 0.1,
  /** Maximum versions to keep per document */
  MAX_VERSIONS: 100,
  /** Maximum changes per version */
  MAX_CHANGES_PER_VERSION: 500,
  /** Maximum summary length */
  MAX_SUMMARY_LENGTH: 2000,
  /** Maximum AI reasoning length */
  MAX_AI_REASONING_LENGTH: 1000,
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
  // Version management routes
  VERSIONS: (documentId: string) => `/api/versions/${documentId}`,
  ADMIN_VERSIONS: (documentId: string) => `/api/admin/versions/${documentId}`,
  ADMIN_VERSION: (documentId: string, versionId: string) => `/api/admin/versions/${documentId}/${versionId}`,
  ADMIN_VERSION_GENERATE: (documentId: string, versionId: string) => `/api/admin/versions/${documentId}/${versionId}/generate`,
  ADMIN_VERSION_PROCESS_AI: (documentId: string, versionId: string) => `/api/admin/versions/${documentId}/${versionId}/process-ai`,
  ADMIN_VERSION_PUBLISH: (documentId: string, versionId: string) => `/api/admin/versions/${documentId}/${versionId}/publish`,
  ADMIN_VERSION_SETTINGS: (documentId: string) => `/api/admin/version-settings/${documentId}`,
  ADMIN_CHANGE: (changeId: string) => `/api/admin/changes/${changeId}`,
} as const;
