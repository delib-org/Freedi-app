/**
 * Error Handling Utilities for Mass Consensus
 *
 * Provides consistent error handling patterns following CLAUDE.md guidelines
 * Integrates with Sentry for production error tracking
 */

import * as Sentry from '@sentry/nextjs';

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
 * A non-OK response from one of our own API routes.
 *
 * Carries the status so Sentry can tell an expired token (401) apart from a
 * missing survey (404) or a broken handler (500) — a bare thrown string leaves
 * every one of those looking identical in the issue list.
 */
export class HttpError extends AppError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    context?: Record<string, unknown>
  ) {
    super(message, `HTTP_${status}`, { ...context, status, url }, status !== 401);
    this.name = 'HttpError';
  }
}

/**
 * Build an HttpError from a fetch Response, pulling the server's own error
 * message out of the body when there is one.
 */
export async function httpErrorFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<HttpError> {
  let serverMessage: string | undefined;
  try {
    const body = (await response.clone().json()) as { error?: string };
    serverMessage = typeof body?.error === 'string' ? body.error : undefined;
  } catch {
    // Body was not JSON — the status alone is the signal.
  }

  return new HttpError(serverMessage || fallbackMessage, response.status, response.url);
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
 * Also sends to Sentry if configured
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

  // Send to Sentry for production monitoring
  Sentry.captureException(error, {
    tags: {
      operation: context.operation,
    },
    user: context.userId ? { id: context.userId } : undefined,
    extra: {
      questionId: context.questionId,
      statementId: context.statementId,
      ...context.metadata,
    },
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
