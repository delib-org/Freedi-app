/**
 * Custom Error Types
 *
 * Provides a hierarchy of typed errors for different failure modes.
 * All custom errors extend AppError, which extends the native Error class.
 * This enables structured error handling with instanceof checks and
 * consistent error context across all Freedi applications.
 */

/**
 * Base application error with a machine-readable code, optional context,
 * and a recoverable flag indicating whether the operation can be retried.
 */
export class AppError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
		public readonly recoverable: boolean = true,
	) {
		super(message);
		this.name = 'AppError';
	}
}

/**
 * Thrown when a database operation fails (Firestore read/write, query timeout, etc.).
 * Marked as recoverable because transient DB failures often resolve on retry.
 */
export class DatabaseError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'DATABASE_ERROR', context, true);
		this.name = 'DatabaseError';
	}
}

/**
 * Thrown when input validation fails (bad form data, schema mismatch, etc.).
 * Marked as NOT recoverable because the same input will always fail validation.
 */
export class ValidationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'VALIDATION_ERROR', context, false);
		this.name = 'ValidationError';
	}
}

/**
 * Thrown when a user is not authenticated (missing or expired token).
 * Marked as NOT recoverable because the user must re-authenticate.
 */
export class AuthenticationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'AUTHENTICATION_ERROR', context, false);
		this.name = 'AuthenticationError';
	}
}

/**
 * Thrown when a user lacks permission for the requested action.
 * Marked as NOT recoverable because the same user/role will always be denied.
 */
export class AuthorizationError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'AUTHORIZATION_ERROR', context, false);
		this.name = 'AuthorizationError';
	}
}

/**
 * Thrown on network failures (fetch timeout, DNS resolution, offline, etc.).
 * Marked as recoverable because network issues are often transient.
 */
export class NetworkError extends AppError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, 'NETWORK_ERROR', context, true);
		this.name = 'NetworkError';
	}
}
