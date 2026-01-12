/**
 * Tests for logger - timestamp-prefixed console logging
 */

import { logger } from '../logger';

describe('logger', () => {
	let consoleInfoSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;
	let consoleWarnSpy: jest.SpyInstance;

	beforeEach(() => {
		consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('logger.info', () => {
		it('should call console.info with timestamped message', () => {
			logger.info('Test message');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const call = consoleInfoSpy.mock.calls[0];
			expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] Test message$/);
		});

		it('should pass additional arguments', () => {
			logger.info('Message with args', { key: 'value' }, 123);

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const call = consoleInfoSpy.mock.calls[0];
			expect(call[1]).toEqual({ key: 'value' });
			expect(call[2]).toBe(123);
		});

		it('should handle empty message', () => {
			logger.info('');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const call = consoleInfoSpy.mock.calls[0];
			expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] $/);
		});
	});

	describe('logger.error', () => {
		it('should call console.error with timestamped message', () => {
			logger.error('Error occurred');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			const call = consoleErrorSpy.mock.calls[0];
			expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] Error occurred$/);
		});

		it('should pass error object as additional argument', () => {
			const error = new Error('Test error');
			logger.error('An error happened', error);

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			const call = consoleErrorSpy.mock.calls[0];
			expect(call[1]).toBe(error);
		});
	});

	describe('logger.warn', () => {
		it('should call console.warn with timestamped message', () => {
			logger.warn('Warning message');

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			const call = consoleWarnSpy.mock.calls[0];
			expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] Warning message$/);
		});

		it('should pass additional context', () => {
			logger.warn('Watch out', { context: 'test' });

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			const call = consoleWarnSpy.mock.calls[0];
			expect(call[1]).toEqual({ context: 'test' });
		});
	});

	describe('logger.debug', () => {
		it('should call console.info with DEBUG prefix', () => {
			logger.debug('Debug info');

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const call = consoleInfoSpy.mock.calls[0];
			expect(call[0]).toMatch(
				/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[DEBUG\] Debug info$/
			);
		});

		it('should pass additional debug data', () => {
			logger.debug('Debug data', { data: [1, 2, 3] });

			expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
			const call = consoleInfoSpy.mock.calls[0];
			expect(call[0]).toContain('[DEBUG]');
			expect(call[1]).toEqual({ data: [1, 2, 3] });
		});
	});

	describe('timestamp format', () => {
		it('should use ISO-like format YYYY-MM-DD HH:mm:ss.SSS', () => {
			logger.info('Test');

			const call = consoleInfoSpy.mock.calls[0][0];
			// Extract timestamp from [timestamp] message format
			const timestampMatch = call.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/);
			expect(timestampMatch).not.toBeNull();

			const timestamp = timestampMatch[1];
			// Verify format
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
		});

		it('should include milliseconds', () => {
			logger.info('Test');

			const call = consoleInfoSpy.mock.calls[0][0];
			// Check for .XXX milliseconds pattern
			expect(call).toMatch(/\.\d{3}\]/);
		});
	});

	describe('default export', () => {
		it('should export logger as default', async () => {
			const { default: defaultLogger } = await import('../logger');
			expect(defaultLogger).toBe(logger);
		});
	});
});
