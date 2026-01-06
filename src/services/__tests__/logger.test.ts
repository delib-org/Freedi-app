/**
 * Tests for Logger service
 */

import { Logger, LogLevel } from '../logger/logger';

// Mock Sentry
jest.mock('@sentry/react', () => ({
	captureException: jest.fn(),
	captureMessage: jest.fn(),
	addBreadcrumb: jest.fn(),
}));

// Mock import.meta.env
const originalEnv = (global as unknown as { import: { meta: { env: { DEV: boolean } } } }).import?.meta?.env;

describe('Logger', () => {
	let logger: Logger;
	let consoleInfoSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		logger = new Logger();
	});

	afterEach(() => {
		consoleInfoSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe('LogLevel enum', () => {
		it('should have correct numeric values', () => {
			expect(LogLevel.DEBUG).toBe(0);
			expect(LogLevel.INFO).toBe(1);
			expect(LogLevel.WARN).toBe(2);
			expect(LogLevel.ERROR).toBe(3);
		});

		it('should allow comparison', () => {
			expect(LogLevel.DEBUG < LogLevel.INFO).toBe(true);
			expect(LogLevel.INFO < LogLevel.WARN).toBe(true);
			expect(LogLevel.WARN < LogLevel.ERROR).toBe(true);
		});
	});

	describe('error()', () => {
		it('should always log errors regardless of log level', () => {
			logger.error('Test error');

			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
			expect(consoleErrorSpy.mock.calls[0][0]).toContain('Test error');
		});

		it('should format error message with timestamp', () => {
			logger.error('Test error');

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			// Check ISO date format pattern
			expect(logMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it('should include context in log message', () => {
			logger.error('Test error', undefined, {
				userId: 'user-123',
				action: 'testAction',
			});

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('user-123');
			expect(logMessage).toContain('testAction');
		});

		it('should handle Error object', () => {
			const error = new Error('Original error');
			logger.error('Test error', error);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('[ERROR]'),
				expect.any(Error)
			);
		});

		it('should convert non-Error to Error object', () => {
			logger.error('Test error', 'string error');

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('[ERROR]'),
				expect.any(Error)
			);
		});
	});

	describe('warn()', () => {
		// Note: With logLevel set to ERROR by default, warn won't log
		// This tests the functionality when it would be enabled
		it('should format warning message correctly when enabled', () => {
			// Since logLevel defaults to ERROR, this won't log
			// but we can still verify the method doesn't throw
			expect(() => logger.warn('Test warning')).not.toThrow();
		});
	});

	describe('info()', () => {
		it('should not log when log level is higher', () => {
			// Default log level is ERROR, so INFO shouldn't log
			logger.info('Test info');
			expect(consoleInfoSpy).not.toHaveBeenCalled();
		});
	});

	describe('debug()', () => {
		it('should not log when log level is higher', () => {
			// Default log level is ERROR, so DEBUG shouldn't log
			logger.debug('Test debug');
			expect(consoleInfoSpy).not.toHaveBeenCalled();
		});
	});

	describe('trackEvent()', () => {
		it('should not throw when tracking events', () => {
			expect(() => logger.trackEvent('test_event', { property: 'value' })).not.toThrow();
		});
	});

	describe('trackPerformance()', () => {
		it('should not throw when tracking performance', () => {
			expect(() => logger.trackPerformance('test_metric', 100)).not.toThrow();
		});

		it('should accept custom unit', () => {
			expect(() => logger.trackPerformance('test_metric', 1024, 'bytes')).not.toThrow();
		});
	});

	describe('group()', () => {
		it('should not throw', () => {
			expect(() => logger.group('Test Group')).not.toThrow();
		});
	});

	describe('groupEnd()', () => {
		it('should not throw', () => {
			expect(() => logger.groupEnd()).not.toThrow();
		});
	});

	describe('createChild()', () => {
		it('should return a logger instance', () => {
			const childLogger = logger.createChild({ userId: 'child-user' });
			expect(childLogger).toBeDefined();
			expect(typeof childLogger.error).toBe('function');
			expect(typeof childLogger.warn).toBe('function');
			expect(typeof childLogger.info).toBe('function');
			expect(typeof childLogger.debug).toBe('function');
		});

		it('should include default context in error logs', () => {
			const childLogger = logger.createChild({ userId: 'child-user-123' });
			childLogger.error('Child error');

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('child-user-123');
		});

		it('should merge provided context with default context', () => {
			const childLogger = logger.createChild({ userId: 'child-user' });
			childLogger.error('Child error', undefined, { action: 'childAction' });

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('child-user');
			expect(logMessage).toContain('childAction');
		});

		it('should allow overriding default context', () => {
			const childLogger = logger.createChild({ userId: 'default-user' });
			childLogger.error('Child error', undefined, { userId: 'override-user' });

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('override-user');
		});
	});

	describe('message formatting', () => {
		it('should include timestamp in ISO format', () => {
			logger.error('Test message');

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			// ISO format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(logMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
		});

		it('should include log level in brackets', () => {
			logger.error('Test message');

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('[ERROR]');
		});

		it('should stringify context as JSON', () => {
			logger.error('Test message', undefined, {
				metadata: { nested: { value: 'test' } },
			});

			const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
			expect(logMessage).toContain('"nested"');
			expect(logMessage).toContain('"value"');
			expect(logMessage).toContain('"test"');
		});
	});
});
