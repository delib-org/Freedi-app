/**
 * Error Handling Utilities for Mass Consensus
 *
 * Provides consistent error handling patterns following CLAUDE.md guidelines
 */

/**
 * Custom error types for different failure modes
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', context, true);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context, false);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', context, true);
    this.name = 'NetworkError';
  }
}

/**
 * Error handling context interface
 */
interface ErrorContext {
  operation: string;
  userId?: string;
  questionId?: string;
  statementId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an error with context
 * Replaces console.error() with structured logging
 */
export function logError(error: unknown, context: ErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Structured error logging
  console.error(`[${context.operation}] Error:`, {
    error: errorMessage,
    stack: errorStack,
    ...context,
  });
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Create a user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return 'Please check your input and try again.';
  }
  if (error instanceof NetworkError) {
    return 'Network error. Please check your connection and try again.';
  }
  if (error instanceof DatabaseError) {
    return 'Unable to save changes. Please try again.';
  }
  return 'An unexpected error occurred. Please try again.';
}
