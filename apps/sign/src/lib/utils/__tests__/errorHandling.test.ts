/**
 * Tests for error handling utilities
 */

import {
  AppError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NetworkError,
  logError,
  getErrorMessage,
  getUserFriendlyErrorMessage,
  isRecoverableError,
  withErrorHandling,
  withErrorHandlingSync,
} from '../errorHandling';

describe('errorHandling', () => {
  // Restore console.error for these tests
  const originalConsoleError = console.error;
  let mockConsoleError: jest.Mock;

  beforeEach(() => {
    mockConsoleError = jest.fn();
    console.error = mockConsoleError;
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('Custom Error Classes', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 'TEST_CODE', { foo: 'bar' }, true);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ foo: 'bar' });
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create DatabaseError with correct defaults', () => {
      const error = new DatabaseError('DB error', { query: 'test' });
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('DatabaseError');
    });

    it('should create ValidationError as non-recoverable', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.recoverable).toBe(false);
    });

    it('should create AuthenticationError as non-recoverable', () => {
      const error = new AuthenticationError('Not authenticated');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.recoverable).toBe(false);
    });

    it('should create AuthorizationError as non-recoverable', () => {
      const error = new AuthorizationError('Not authorized');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.recoverable).toBe(false);
    });

    it('should create NetworkError as recoverable', () => {
      const error = new NetworkError('Network failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test.operation', userId: 'user123' });

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[test.operation]'),
        expect.objectContaining({
          operation: 'test.operation',
          userId: 'user123',
          error: 'Test error',
        })
      );
    });

    it('should handle non-Error objects', () => {
      logError('string error', { operation: 'test.operation' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[test.operation]'),
        expect.objectContaining({
          error: 'string error',
        })
      );
    });

    it('should include AppError code in log', () => {
      const error = new DatabaseError('DB failed');
      logError(error, { operation: 'db.query' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          code: 'DATABASE_ERROR',
        })
      );
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    it('should return string as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return fallback for unknown types', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
      expect(getErrorMessage(123)).toBe('An unknown error occurred');
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return friendly message for ValidationError', () => {
      const error = new ValidationError('Invalid');
      expect(getUserFriendlyErrorMessage(error)).toBe('Please check your input and try again.');
    });

    it('should return friendly message for AuthenticationError', () => {
      const error = new AuthenticationError('Not logged in');
      expect(getUserFriendlyErrorMessage(error)).toBe('Please sign in to continue.');
    });

    it('should return friendly message for AuthorizationError', () => {
      const error = new AuthorizationError('Forbidden');
      expect(getUserFriendlyErrorMessage(error)).toBe('You do not have permission to perform this action.');
    });

    it('should return friendly message for NetworkError', () => {
      const error = new NetworkError('Connection failed');
      expect(getUserFriendlyErrorMessage(error)).toBe('Network error. Please check your connection and try again.');
    });

    it('should return friendly message for DatabaseError', () => {
      const error = new DatabaseError('Write failed');
      expect(getUserFriendlyErrorMessage(error)).toBe('Unable to save changes. Please try again.');
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Unknown');
      expect(getUserFriendlyErrorMessage(error)).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for recoverable AppError', () => {
      const error = new DatabaseError('DB error');
      expect(isRecoverableError(error)).toBe(true);
    });

    it('should return false for non-recoverable AppError', () => {
      const error = new ValidationError('Invalid');
      expect(isRecoverableError(error)).toBe(false);
    });

    it('should return true for network-related errors', () => {
      const error = new Error('network error occurred');
      expect(isRecoverableError(error)).toBe(true);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Some error');
      expect(isRecoverableError(error)).toBe(false);
    });
  });

  describe('withErrorHandling', () => {
    it('should return result on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const wrapped = withErrorHandling(fn, { operation: 'test' });

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should return undefined and log on error', async () => {
      const error = new Error('Failed');
      const fn = jest.fn().mockRejectedValue(error);
      const wrapped = withErrorHandling(fn, { operation: 'test' });

      const result = await wrapped();

      expect(result).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe('withErrorHandlingSync', () => {
    it('should return result on success', () => {
      const fn = jest.fn().mockReturnValue('success');
      const wrapped = withErrorHandlingSync(fn, { operation: 'test' });

      const result = wrapped('arg1');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should return undefined and log on error', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('Failed');
      });
      const wrapped = withErrorHandlingSync(fn, { operation: 'test' });

      const result = wrapped();

      expect(result).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });
});
