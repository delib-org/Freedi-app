/**
 * Error Handling Utilities for Sign App
 *
 * Provides consistent error handling patterns across the application.
 * Replaces generic console.error() with structured error logging.
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

export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', context, false);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', context, false);
    this.name = 'AuthorizationError';
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
export interface ErrorContext {
  operation: string;
  userId?: string;
  documentId?: string;
  paragraphId?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Format error for logging
 */
function formatError(error: unknown): {
  message: string;
  stack?: string;
  code?: string;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

/**
 * Log an error with context
 * Use this instead of bare console.error()
 */
export function logError(error: unknown, context: ErrorContext): void {
  const timestamp = new Date().toISOString();
  const errorInfo = formatError(error);

  const logData = {
    timestamp,
    operation: context.operation,
    error: errorInfo.message,
    code: errorInfo.code,
    ...(context.userId && { userId: context.userId }),
    ...(context.documentId && { documentId: context.documentId }),
    ...(context.paragraphId && { paragraphId: context.paragraphId }),
    ...(context.component && { component: context.component }),
    ...(context.metadata && { metadata: context.metadata }),
    ...(process.env.NODE_ENV === 'development' && { stack: errorInfo.stack }),
  };

  // Structured error logging
  console.error(`[${timestamp}] [${context.operation}] ${errorInfo.message}`, logData);
}

/**
 * Higher-order function for wrapping async functions with error handling
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context: Omit<ErrorContext, 'metadata'>
): (...args: T) => Promise<R | undefined> {
  return async (...args: T): Promise<R | undefined> => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, {
        ...context,
        metadata: { args: args.length > 0 ? args : undefined },
      });
      return undefined;
    }
  };
}

/**
 * Higher-order function for wrapping sync functions with error handling
 */
export function withErrorHandlingSync<T extends unknown[], R>(
  fn: (...args: T) => R,
  context: Omit<ErrorContext, 'metadata'>
): (...args: T) => R | undefined {
  return (...args: T): R | undefined => {
    try {
      return fn(...args);
    } catch (error) {
      logError(error, {
        ...context,
        metadata: { args: args.length > 0 ? args : undefined },
      });
      return undefined;
    }
  };
}

/**
 * Retry logic for transient failures
 */
interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  context: ErrorContext
): Promise<T> {
  const { maxRetries, delayMs, exponentialBackoff = false, onRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = exponentialBackoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;

      console.info(`[Retry] ${context.operation} - Attempt ${attempt}/${maxRetries}, waiting ${delay}ms`);

      if (onRetry) {
        onRetry(attempt, error);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logError(lastError, {
    ...context,
    metadata: { maxRetries, failedAfterRetries: true },
  });
  throw lastError;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }

  // Network errors are typically recoverable
  if (error instanceof Error && error.message.includes('network')) {
    return true;
  }

  return false;
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
  if (error instanceof AuthenticationError) {
    return 'Please sign in to continue.';
  }
  if (error instanceof AuthorizationError) {
    return 'You do not have permission to perform this action.';
  }
  if (error instanceof NetworkError) {
    return 'Network error. Please check your connection and try again.';
  }
  if (error instanceof DatabaseError) {
    return 'Unable to save changes. Please try again.';
  }
  return 'An unexpected error occurred. Please try again.';
}
