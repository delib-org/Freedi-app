/**
 * Tests for errorHandling utility functions
 */
import {
  AppError,
  DatabaseError,
  ValidationError,
  NetworkError,
  logError,
  getErrorMessage,
  getUserFriendlyErrorMessage,
} from '../errorHandling';

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/nextjs';

describe('errorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AppError', () => {
    it('should create error with message and code', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('AppError');
    });

    it('should include context when provided', () => {
      const context = { userId: '123', action: 'test' };
      const error = new AppError('Test error', 'TEST_ERROR', context);
      expect(error.context).toEqual(context);
    });

    it('should default recoverable to true', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.recoverable).toBe(true);
    });

    it('should allow setting recoverable to false', () => {
      const error = new AppError('Test error', 'TEST_ERROR', undefined, false);
      expect(error.recoverable).toBe(false);
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have a stack trace', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.stack).toBeDefined();
    });
  });

  describe('DatabaseError', () => {
    it('should create error with DATABASE_ERROR code', () => {
      const error = new DatabaseError('Database connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.name).toBe('DatabaseError');
    });

    it('should be recoverable by default', () => {
      const error = new DatabaseError('Query failed');
      expect(error.recoverable).toBe(true);
    });

    it('should be an instance of AppError', () => {
      const error = new DatabaseError('Error');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should include context when provided', () => {
      const context = { collection: 'users', documentId: '123' };
      const error = new DatabaseError('Document not found', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('ValidationError', () => {
    it('should create error with VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should NOT be recoverable', () => {
      const error = new ValidationError('Bad data');
      expect(error.recoverable).toBe(false);
    });

    it('should be an instance of AppError', () => {
      const error = new ValidationError('Error');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should include context with field information', () => {
      const context = { field: 'email', value: 'invalid' };
      const error = new ValidationError('Invalid email format', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('NetworkError', () => {
    it('should create error with NETWORK_ERROR code', () => {
      const error = new NetworkError('Connection timeout');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('NetworkError');
    });

    it('should be recoverable by default', () => {
      const error = new NetworkError('Network unavailable');
      expect(error.recoverable).toBe(true);
    });

    it('should be an instance of AppError', () => {
      const error = new NetworkError('Error');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should include context with request information', () => {
      const context = { url: '/api/data', method: 'GET' };
      const error = new NetworkError('Request failed', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('logError', () => {
    it('should log error with operation context', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test.operation' });

      expect(console.error).toHaveBeenCalledWith(
        '[test.operation] Error:',
        expect.objectContaining({
          error: 'Test error',
          operation: 'test.operation',
        })
      );
    });

    it('should include stack trace in logged output', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test.operation' });

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          stack: expect.any(String),
        })
      );
    });

    it('should send error to Sentry', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test.operation' });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { operation: 'test.operation' },
        })
      );
    });

    it('should include userId in Sentry context', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test', userId: 'user123' });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          user: { id: 'user123' },
        })
      );
    });

    it('should include questionId in Sentry extra', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test', questionId: 'q123' });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({ questionId: 'q123' }),
        })
      );
    });

    it('should include statementId in Sentry extra', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test', statementId: 's123' });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({ statementId: 's123' }),
        })
      );
    });

    it('should include metadata in Sentry extra', () => {
      const error = new Error('Test error');
      logError(error, {
        operation: 'test',
        metadata: { customField: 'value' },
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({ customField: 'value' }),
        })
      );
    });

    it('should handle string errors', () => {
      logError('String error message', { operation: 'test' });

      expect(console.error).toHaveBeenCalledWith(
        '[test] Error:',
        expect.objectContaining({
          error: 'String error message',
        })
      );
    });

    it('should handle non-Error objects', () => {
      logError({ custom: 'error' }, { operation: 'test' });

      expect(console.error).toHaveBeenCalledWith(
        '[test] Error:',
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should not include user in Sentry when userId is not provided', () => {
      const error = new Error('Test');
      logError(error, { operation: 'test' });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          user: undefined,
        })
      );
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      const message = getErrorMessage(error);
      expect(message).toBe('Test error message');
    });

    it('should extract message from AppError', () => {
      const error = new AppError('App error message', 'TEST');
      const message = getErrorMessage(error);
      expect(message).toBe('App error message');
    });

    it('should return string directly', () => {
      const message = getErrorMessage('String error');
      expect(message).toBe('String error');
    });

    it('should return default message for unknown error types', () => {
      const message = getErrorMessage({ custom: 'error' });
      expect(message).toBe('An unknown error occurred');
    });

    it('should return default message for null', () => {
      const message = getErrorMessage(null);
      expect(message).toBe('An unknown error occurred');
    });

    it('should return default message for undefined', () => {
      const message = getErrorMessage(undefined);
      expect(message).toBe('An unknown error occurred');
    });

    it('should return default message for number', () => {
      const message = getErrorMessage(404);
      expect(message).toBe('An unknown error occurred');
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return validation message for ValidationError', () => {
      const error = new ValidationError('Bad input');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('Please check your input and try again.');
    });

    it('should return network message for NetworkError', () => {
      const error = new NetworkError('Connection failed');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('Network error. Please check your connection and try again.');
    });

    it('should return database message for DatabaseError', () => {
      const error = new DatabaseError('Query failed');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('Unable to save changes. Please try again.');
    });

    it('should return generic message for AppError', () => {
      const error = new AppError('Some error', 'SOME_ERROR');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });

    it('should return generic message for standard Error', () => {
      const error = new Error('Standard error');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });

    it('should return generic message for string error', () => {
      const message = getUserFriendlyErrorMessage('string error');
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });

    it('should return generic message for unknown types', () => {
      const message = getUserFriendlyErrorMessage({ custom: 'error' });
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });

    it('should return generic message for null', () => {
      const message = getUserFriendlyErrorMessage(null);
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('error type checking', () => {
    it('should correctly identify ValidationError with instanceof', () => {
      const error = new ValidationError('test');
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should correctly identify DatabaseError with instanceof', () => {
      const error = new DatabaseError('test');
      expect(error instanceof DatabaseError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should correctly identify NetworkError with instanceof', () => {
      const error = new NetworkError('test');
      expect(error instanceof NetworkError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should distinguish between error types', () => {
      const validationError = new ValidationError('test');
      const databaseError = new DatabaseError('test');
      const networkError = new NetworkError('test');

      expect(validationError instanceof DatabaseError).toBe(false);
      expect(databaseError instanceof ValidationError).toBe(false);
      expect(networkError instanceof ValidationError).toBe(false);
    });
  });
});
