/**
 * Error Handling Utilities Tests
 *
 * Tests for error handling utilities to ensure proper error logging and handling.
 */

import {
	AppError,
	DatabaseError,
	ValidationError,
	AuthenticationError,
	AuthorizationError,
	NetworkError,
	withErrorHandling,
	withErrorHandlingSync,
	withRetry,
	isRecoverableError,
	getErrorMessage,
	getUserFriendlyErrorMessage,
} from '../errorHandling';

// Mock the logger
jest.mock('@/services/logger', () => ({
	logger: {
		error: jest.fn(),
		info: jest.fn(),
	},
}));

describe('Error Types', () => {
	describe('AppError', () => {
		it('should create an AppError with correct properties', () => {
			const error = new AppError('Test error', 'TEST_CODE', { key: 'value' }, true);

			expect(error.message).toBe('Test error');
			expect(error.code).toBe('TEST_CODE');
			expect(error.context).toEqual({ key: 'value' });
			expect(error.recoverable).toBe(true);
			expect(error.name).toBe('AppError');
		});
	});

	describe('DatabaseError', () => {
		it('should create a DatabaseError', () => {
			const error = new DatabaseError('DB error', { table: 'users' });

			expect(error.message).toBe('DB error');
			expect(error.code).toBe('DATABASE_ERROR');
			expect(error.context).toEqual({ table: 'users' });
			expect(error.recoverable).toBe(true);
			expect(error.name).toBe('DatabaseError');
		});
	});

	describe('ValidationError', () => {
		it('should create a ValidationError', () => {
			const error = new ValidationError('Invalid input', { field: 'email' });

			expect(error.message).toBe('Invalid input');
			expect(error.code).toBe('VALIDATION_ERROR');
			expect(error.recoverable).toBe(false);
			expect(error.name).toBe('ValidationError');
		});
	});

	describe('AuthenticationError', () => {
		it('should create an AuthenticationError', () => {
			const error = new AuthenticationError('Not authenticated');

			expect(error.message).toBe('Not authenticated');
			expect(error.code).toBe('AUTHENTICATION_ERROR');
			expect(error.recoverable).toBe(false);
		});
	});

	describe('AuthorizationError', () => {
		it('should create an AuthorizationError', () => {
			const error = new AuthorizationError('Not authorized');

			expect(error.message).toBe('Not authorized');
			expect(error.code).toBe('AUTHORIZATION_ERROR');
			expect(error.recoverable).toBe(false);
		});
	});

	describe('NetworkError', () => {
		it('should create a NetworkError', () => {
			const error = new NetworkError('Connection failed');

			expect(error.message).toBe('Connection failed');
			expect(error.code).toBe('NETWORK_ERROR');
			expect(error.recoverable).toBe(true);
		});
	});
});

describe('Error Handling Functions', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('withErrorHandling', () => {
		it('should return result on success', async () => {
			const mockFn = jest.fn().mockResolvedValue('success');
			const wrapped = withErrorHandling(mockFn, {
				operation: 'test.operation',
			});

			const result = await wrapped('arg1', 'arg2');

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
		});

		it('should log error and return undefined on failure', async () => {
			const error = new Error('Test error');
			const mockFn = jest.fn().mockRejectedValue(error);
			const wrapped = withErrorHandling(mockFn, {
				operation: 'test.operation',
			});

			const result = await wrapped('arg1');

			expect(result).toBeUndefined();
			expect(mockFn).toHaveBeenCalledWith('arg1');
		});
	});

	describe('withErrorHandlingSync', () => {
		it('should return result on success', () => {
			const mockFn = jest.fn().mockReturnValue('success');
			const wrapped = withErrorHandlingSync(mockFn, {
				operation: 'test.operation',
			});

			const result = wrapped('arg1', 'arg2');

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
		});

		it('should log error and return undefined on failure', () => {
			const error = new Error('Test error');
			const mockFn = jest.fn().mockImplementation(() => {
				throw error;
			});
			const wrapped = withErrorHandlingSync(mockFn, {
				operation: 'test.operation',
			});

			const result = wrapped('arg1');

			expect(result).toBeUndefined();
			expect(mockFn).toHaveBeenCalledWith('arg1');
		});
	});

	describe('withRetry', () => {
		it('should succeed on first attempt', async () => {
			const mockFn = jest.fn().mockResolvedValue('success');

			const result = await withRetry(
				mockFn,
				{ maxRetries: 3, delayMs: 100 },
				{ operation: 'test.operation' },
			);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should retry on failure and eventually succeed', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('fail 1'))
				.mockRejectedValueOnce(new Error('fail 2'))
				.mockResolvedValue('success');

			const result = await withRetry(
				mockFn,
				{ maxRetries: 3, delayMs: 10 },
				{ operation: 'test.operation' },
			);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(3);
		});

		it('should throw error after max retries', async () => {
			const error = new Error('persistent failure');
			const mockFn = jest.fn().mockRejectedValue(error);

			await expect(
				withRetry(mockFn, { maxRetries: 2, delayMs: 10 }, { operation: 'test.operation' }),
			).rejects.toThrow('persistent failure');

			expect(mockFn).toHaveBeenCalledTimes(2);
		});

		it('should call onRetry callback', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('fail'))
				.mockResolvedValue('success');
			const onRetry = jest.fn();

			await withRetry(
				mockFn,
				{ maxRetries: 3, delayMs: 10, onRetry },
				{ operation: 'test.operation' },
			);

			expect(onRetry).toHaveBeenCalledTimes(1);
			expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
		});
	});

	describe('isRecoverableError', () => {
		it('should return true for recoverable AppError', () => {
			const error = new AppError('error', 'CODE', {}, true);

			expect(isRecoverableError(error)).toBe(true);
		});

		it('should return false for non-recoverable AppError', () => {
			const error = new AppError('error', 'CODE', {}, false);

			expect(isRecoverableError(error)).toBe(false);
		});

		it('should return true for network errors', () => {
			const error = new Error('network timeout');

			expect(isRecoverableError(error)).toBe(true);
		});

		it('should return false for generic errors', () => {
			const error = new Error('some error');

			expect(isRecoverableError(error)).toBe(false);
		});
	});

	describe('getErrorMessage', () => {
		it('should extract message from Error object', () => {
			const error = new Error('Test error');

			expect(getErrorMessage(error)).toBe('Test error');
		});

		it('should return string error as-is', () => {
			expect(getErrorMessage('String error')).toBe('String error');
		});

		it('should return default message for unknown error', () => {
			expect(getErrorMessage(null)).toBe('An unknown error occurred');
		});
	});

	describe('getUserFriendlyErrorMessage', () => {
		it('should return friendly message for ValidationError', () => {
			const error = new ValidationError('Invalid');

			expect(getUserFriendlyErrorMessage(error)).toBe('Please check your input and try again.');
		});

		it('should return friendly message for AuthenticationError', () => {
			const error = new AuthenticationError('Not authenticated');

			expect(getUserFriendlyErrorMessage(error)).toBe('Please sign in to continue.');
		});

		it('should return friendly message for AuthorizationError', () => {
			const error = new AuthorizationError('Not authorized');

			expect(getUserFriendlyErrorMessage(error)).toBe(
				'You do not have permission to perform this action.',
			);
		});

		it('should return friendly message for NetworkError', () => {
			const error = new NetworkError('Connection failed');

			expect(getUserFriendlyErrorMessage(error)).toBe(
				'Network error. Please check your connection and try again.',
			);
		});

		it('should return friendly message for DatabaseError', () => {
			const error = new DatabaseError('DB error');

			expect(getUserFriendlyErrorMessage(error)).toBe('Unable to save changes. Please try again.');
		});

		it('should return generic message for unknown error', () => {
			const error = new Error('Unknown');

			expect(getUserFriendlyErrorMessage(error)).toBe(
				'An unexpected error occurred. Please try again.',
			);
		});
	});
});
