/**
 * Common Constants for Mass Consensus
 *
 * Centralized constants to replace magic numbers throughout the codebase
 * Following CLAUDE.md guidelines
 */

/**
 * Time constants (in milliseconds)
 */
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

/**
 * UI constants (in milliseconds)
 */
export const UI = {
  DEBOUNCE_DELAY: 300,
  FORM_RESET_DELAY: 300,
  AUTO_REDIRECT_SECONDS: 3,
  LOADER_TICK_INTERVAL: 150,
  LOADER_TIME_UPDATE_INTERVAL: 1000,
  LOADER_CANCEL_THRESHOLD: 30, // seconds
  ANIMATION_DURATION: 200,
} as const;

/**
 * Validation constants
 */
export const VALIDATION = {
  MIN_SOLUTION_LENGTH: 3,
  MAX_SOLUTION_LENGTH: 500,
  MAX_SIMILAR_SOLUTIONS_DISPLAY: 3,
  MIN_STATEMENT_LENGTH: 10, // Minimum length for proposals/statements
  MAX_STATEMENT_LENGTH: 500, // Maximum length for proposals/statements
} as const;

/**
 * Loader stage configuration
 */
export const LOADER_STAGES = {
  CONTENT_CHECK: {
    progressStart: 0,
    progressEnd: 25,
    duration: 8, // seconds
  },
  SIMILARITY_SEARCH: {
    progressStart: 25,
    progressEnd: 60,
    duration: 10,
  },
  COMPARISON: {
    progressStart: 60,
    progressEnd: 85,
    duration: 7,
  },
  FINALIZING: {
    progressStart: 85,
    progressEnd: 100,
    duration: 5,
  },
} as const;

/**
 * Progress bar constants
 */
export const PROGRESS = {
  INCREMENT_PERCENT: 0.5,
  MAX_PERCENT: 100,
} as const;

/**
 * API constants
 */
export const API = {
  REQUEST_TIMEOUT: 30 * TIME.SECOND,
  MAX_DURATION_MESSAGE: 'This may take up to 30 seconds',
} as const;

/**
 * Swipe interaction constants
 */
export const SWIPE = {
  // Thresholds (in pixels)
  LIKE_THRESHOLD: 100, // px - threshold for "like" swipe
  LOVE_THRESHOLD: 200, // px - threshold for "love" swipe
  DISLIKE_THRESHOLD: -100, // px
  HATE_THRESHOLD: -200, // px
  ROTATION_FACTOR: 20, // degrees per 100px

  // Animation (in milliseconds)
  SWIPE_DURATION: 300, // ms
  CARD_ENTER_DURATION: 400, // ms
  CARD_STACK_OFFSET: 10, // px between stacked cards

  // UX Flow
  PROPOSAL_PROMPT_INTERVAL: 7, // Show "propose idea" after N cards
  BATCH_SIZE: 10, // Load N cards at a time
  PRELOAD_AHEAD: 3, // Preload next N cards
} as const;

/**
 * Rating values (-2 to +2 scale)
 */
export const RATING = {
  HATE: -2,
  DISLIKE: -1,
  NEUTRAL: 0,
  LIKE: 1,
  LOVE: 2,
} as const;

/**
 * Email notification constants
 */
export const EMAIL_NOTIFICATIONS = {
  TOKEN_LENGTH: 32, // bytes (64 hex chars)
  CONFIRMATION_EXPIRY: 7 * TIME.DAY,
  DIGEST_SEND_HOUR: 9, // 9 AM
  MIN_ACTIVITY_FOR_DIGEST: 1,
  RATE_LIMIT_PER_HOUR: 5,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  GENERIC: 'An unexpected error occurred. Please try again.',
  NETWORK: 'Network error. Please check your connection and try again.',
  VALIDATION: 'Please check your input and try again.',
  MISSING_INPUT: 'Please provide a valid solution and ensure you are logged in.',
  INAPPROPRIATE_CONTENT: 'Your submission contains inappropriate content. Please revise.',
  LIMIT_REACHED: "You've reached the maximum number of solutions for this question.",
  SUBMIT_FAILED: 'Failed to submit solution',
  CHECK_SIMILAR_FAILED: 'Unable to check for similar solutions. Please try again.',
  MERGE_FAILED: 'Failed to merge with existing solution. Please try again.',
} as const;
