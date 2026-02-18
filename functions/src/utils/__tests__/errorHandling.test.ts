import {
	AppError,
	DatabaseError,
	ValidationError,
	AuthenticationError,
	AuthorizationError,
	logError,
	getErrorMessage,
	withErrorHandling,
} from '../errorHandling';

describe('Error Handling Utilities', () => {
	let consoleInfoSpy: jest.SpyInstance;

	beforeEach(() => {
		consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
	});

	afterEach(() => {
		consoleInfoSpy.mockRestore();
	});

	describe('Error Classes', () => {
		it('should create AppError with code and context', () => {
			const error = new AppError('test error', 'TEST_CODE', { key: 'value' });
			expect(error.message).toBe('test error');
			expect(error.code).toBe('TEST_CODE');
			expect(error.context).toEqual({ key: 'value' });
			expect(error.recoverable).toBe(true);
			expect(error.name).toBe('AppError');
			expect(error).toBeInstanceOf(Error);
		});

		it('should create DatabaseError with correct defaults', () => {
			const error = new DatabaseError('db failed', { collection: 'users' });
			expect(error.code).toBe('DATABASE_ERROR');
			expect(error.name).toBe('DatabaseError');
			expect(error.recoverable).toBe(true);
			expect(error.context).toEqual({ collection: 'users' });
			expect(error).toBeInstanceOf(AppError);
		});

		it('should create ValidationError as non-recoverable', () => {
			const error = new ValidationError('invalid input');
			expect(error.code).toBe('VALIDATION_ERROR');
			expect(error.name).toBe('ValidationError');
			expect(error.recoverable).toBe(false);
			expect(error).toBeInstanceOf(AppError);
		});

		it('should create AuthenticationError as non-recoverable', () => {
			const error = new AuthenticationError('not authenticated');
			expect(error.code).toBe('AUTHENTICATION_ERROR');
			expect(error.name).toBe('AuthenticationError');
			expect(error.recoverable).toBe(false);
		});

		it('should create AuthorizationError as non-recoverable', () => {
			const error = new AuthorizationError('forbidden', { role: 'user' });
			expect(error.code).toBe('AUTHORIZATION_ERROR');
			expect(error.name).toBe('AuthorizationError');
			expect(error.recoverable).toBe(false);
			expect(error.context).toEqual({ role: 'user' });
		});
	});

	describe('logError', () => {
		it('should log a structured JSON entry for Error instances', () => {
			const error = new Error('something broke');
			logError(error, { operation: 'test.operation' });

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.severity).toBe('ERROR');
			expect(logEntry.operation).toBe('test.operation');
			expect(logEntry.message).toBe('something broke');
			expect(logEntry.errorName).toBe('Error');
			expect(logEntry.stack).toBeDefined();
		});

		it('should log with userId and statementId when provided', () => {
			const error = new Error('fail');
			logError(error, {
				operation: 'test.op',
				userId: 'user123',
				statementId: 'stmt456',
			});

			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.userId).toBe('user123');
			expect(logEntry.statementId).toBe('stmt456');
		});

		it('should log with metadata when provided', () => {
			const error = new Error('fail');
			logError(error, {
				operation: 'test.op',
				metadata: { extra: 'data', count: 42 },
			});

			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.metadata).toEqual({ extra: 'data', count: 42 });
		});

		it('should handle non-Error thrown values', () => {
			logError('string error', { operation: 'test.stringError' });

			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.message).toBe('string error');
			expect(logEntry.errorName).toBe('Error');
		});

		it('should handle custom AppError subclasses', () => {
			const error = new DatabaseError('query failed', { collection: 'statements' });
			logError(error, { operation: 'db.query' });

			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.errorName).toBe('DatabaseError');
			expect(logEntry.message).toBe('query failed');
		});
	});

	describe('getErrorMessage', () => {
		it('should extract message from Error instance', () => {
			expect(getErrorMessage(new Error('test message'))).toBe('test message');
		});

		it('should return string errors directly', () => {
			expect(getErrorMessage('direct string')).toBe('direct string');
		});

		it('should return default message for unknown types', () => {
			expect(getErrorMessage(42)).toBe('An unknown error occurred');
			expect(getErrorMessage(null)).toBe('An unknown error occurred');
			expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
			expect(getErrorMessage({ foo: 'bar' })).toBe('An unknown error occurred');
		});
	});

	describe('withErrorHandling', () => {
		it('should return the function result on success', async () => {
			const fn = async (x: number) => x * 2;
			const wrapped = withErrorHandling(fn, { operation: 'test.double' });
			const result = await wrapped(5);
			expect(result).toBe(10);
		});

		it('should return undefined and log on error', async () => {
			const fn = async () => {
				throw new Error('boom');
			};
			const wrapped = withErrorHandling(fn, { operation: 'test.boom' });
			const result = await wrapped();

			expect(result).toBeUndefined();
			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const logEntry = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
			expect(logEntry.operation).toBe('test.boom');
			expect(logEntry.message).toBe('boom');
		});

		it('should pass through arguments correctly', async () => {
			const fn = async (a: string, b: number) => `${a}-${b}`;
			const wrapped = withErrorHandling(fn, { operation: 'test.concat' });
			const result = await wrapped('hello', 42);
			expect(result).toBe('hello-42');
		});
	});
});
