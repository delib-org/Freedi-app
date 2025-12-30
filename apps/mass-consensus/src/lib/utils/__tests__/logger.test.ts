/**
 * Tests for logger utility
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
    it('should call console.info with formatted message', () => {
      logger.info('Test message');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });

    it('should include timestamp in message', () => {
      logger.info('Test message');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      // Check for ISO-like timestamp format: [YYYY-MM-DD HH:MM:SS.mmm]
      expect(calledWith).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    it('should include the message after timestamp', () => {
      logger.info('Hello World');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      expect(calledWith).toContain('Hello World');
    });

    it('should pass additional arguments', () => {
      logger.info('Test', { key: 'value' }, 123);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test'),
        { key: 'value' },
        123
      );
    });

    it('should handle empty message', () => {
      logger.info('');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('logger.error', () => {
    it('should call console.error with formatted message', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should include timestamp in message', () => {
      logger.error('Error occurred');
      const calledWith = consoleErrorSpy.mock.calls[0][0];
      expect(calledWith).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    it('should include the message after timestamp', () => {
      logger.error('Something went wrong');
      const calledWith = consoleErrorSpy.mock.calls[0][0];
      expect(calledWith).toContain('Something went wrong');
    });

    it('should pass error objects as additional arguments', () => {
      const error = new Error('Test error');
      logger.error('Failed', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed'),
        error
      );
    });
  });

  describe('logger.warn', () => {
    it('should call console.warn with formatted message', () => {
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('should include timestamp in message', () => {
      logger.warn('Be careful');
      const calledWith = consoleWarnSpy.mock.calls[0][0];
      expect(calledWith).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    it('should include the message after timestamp', () => {
      logger.warn('Deprecation notice');
      const calledWith = consoleWarnSpy.mock.calls[0][0];
      expect(calledWith).toContain('Deprecation notice');
    });

    it('should pass additional arguments', () => {
      logger.warn('Warning', { details: 'info' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning'),
        { details: 'info' }
      );
    });
  });

  describe('logger.debug', () => {
    it('should call console.info with formatted message', () => {
      logger.debug('Debug message');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });

    it('should include [DEBUG] label in message', () => {
      logger.debug('Debugging info');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      expect(calledWith).toContain('[DEBUG]');
    });

    it('should include timestamp in message', () => {
      logger.debug('Debug');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      expect(calledWith).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    it('should include the message after [DEBUG] label', () => {
      logger.debug('Variable value');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      expect(calledWith).toContain('Variable value');
    });

    it('should pass additional arguments', () => {
      logger.debug('State', { count: 42 });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        { count: 42 }
      );
    });
  });

  describe('timestamp format', () => {
    it('should produce consistent timestamp format across all levels', () => {
      logger.info('info');
      logger.error('error');
      logger.warn('warn');
      logger.debug('debug');

      const timestampRegex = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/;

      expect(consoleInfoSpy.mock.calls[0][0]).toMatch(timestampRegex);
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(timestampRegex);
      expect(consoleWarnSpy.mock.calls[0][0]).toMatch(timestampRegex);
      // Debug also uses console.info
      expect(consoleInfoSpy.mock.calls[1][0]).toMatch(timestampRegex);
    });

    it('should have timestamp with exactly 23 characters (ISO format truncated)', () => {
      logger.info('test');
      const calledWith = consoleInfoSpy.mock.calls[0][0];
      // Format: [YYYY-MM-DD HH:MM:SS.mmm] message
      // The timestamp part inside brackets is 23 chars: 2024-12-30 12:34:56.789
      const match = calledWith.match(/^\[([^\]]+)\]/);
      expect(match).toBeTruthy();
      expect(match![1]).toHaveLength(23);
    });
  });

  describe('multiple arguments', () => {
    it('should handle multiple primitive arguments', () => {
      logger.info('Values:', 1, 'two', true, null);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Values:'),
        1,
        'two',
        true,
        null
      );
    });

    it('should handle array arguments', () => {
      logger.info('Array:', [1, 2, 3]);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Array:'),
        [1, 2, 3]
      );
    });

    it('should handle no additional arguments', () => {
      logger.info('Just a message');
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Just a message'));
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in message', () => {
      logger.info('Special: \n\t"quotes" & <tags>');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle unicode characters', () => {
      logger.info('Unicode: \u{1F600} \u{1F4A1}');
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('Unicode:');
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      logger.info(longMessage);
      expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining(longMessage));
    });
  });

  describe('default export', () => {
    it('should be the same as named export', async () => {
      // Import default export
      const defaultLogger = (await import('../logger')).default;
      expect(defaultLogger).toBe(logger);
    });
  });
});
