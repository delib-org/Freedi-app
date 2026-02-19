/**
 * Tests for errorBoundaryHelpers
 *
 * Tests error classification, user-friendly messages, and bug report generation.
 */

import {
	isChunkLoadError,
	getUserFriendlyErrorMessage,
	formatErrorDetails,
	generateBugReportEmail,
} from '../errorBoundaryHelpers';

describe('errorBoundaryHelpers', () => {
	describe('isChunkLoadError', () => {
		it('should detect dynamically imported module errors', () => {
			const error = new Error('Failed to fetch dynamically imported module');
			expect(isChunkLoadError(error)).toBe(true);
		});

		it('should detect loading chunk errors', () => {
			const error = new Error('Loading chunk 5 failed');
			expect(isChunkLoadError(error)).toBe(true);
		});

		it('should detect MIME type errors', () => {
			const error = new Error('Expected a JavaScript module script');
			expect(isChunkLoadError(error)).toBe(true);
		});

		it('should detect ChunkLoadError by name', () => {
			const error = new Error('chunk failed');
			error.name = 'ChunkLoadError';
			expect(isChunkLoadError(error)).toBe(true);
		});

		it('should detect CSS chunk loading errors', () => {
			const error = new Error('Loading CSS chunk failed');
			expect(isChunkLoadError(error)).toBe(true);
		});

		it('should return false for regular errors', () => {
			const error = new Error('Something went wrong');
			expect(isChunkLoadError(error)).toBe(false);
		});

		it('should return false for TypeError', () => {
			const error = new TypeError('Cannot read properties of null');
			expect(isChunkLoadError(error)).toBe(false);
		});
	});

	describe('getUserFriendlyErrorMessage', () => {
		it('should return app update message for chunk load errors', () => {
			const error = new Error('Failed to fetch dynamically imported module');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('App Update Available');
			expect(result.shouldAutoReload).toBe(true);
			expect(result.titleHebrew).toBeDefined();
		});

		it('should return connection message for network errors', () => {
			const error = new Error('Network request failed');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('Connection Problem');
		});

		it('should return connection message for fetch errors', () => {
			const error = new Error('Failed to fetch');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('Connection Problem');
		});

		it('should return permission message for denied errors', () => {
			const error = new Error('Permission denied');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('Permission Denied');
		});

		it('should return timeout message for timeout errors', () => {
			const error = new Error('Request timeout exceeded');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('Request Timeout');
		});

		it('should return generic message for unknown errors', () => {
			const error = new Error('Some random error');
			const result = getUserFriendlyErrorMessage(error);
			expect(result.title).toBe('Something went wrong');
			expect(result.titleHebrew).toBe('משהו השתבש');
		});

		it('should include Hebrew translations for all error types', () => {
			const errors = [
				new Error('Failed to fetch dynamically imported module'),
				new Error('Network error'),
				new Error('Permission denied'),
				new Error('Timeout'),
				new Error('Unknown'),
			];
			errors.forEach((error) => {
				const result = getUserFriendlyErrorMessage(error);
				expect(result.titleHebrew).toBeDefined();
				expect(result.descriptionHebrew).toBeDefined();
			});
		});
	});

	describe('formatErrorDetails', () => {
		it('should include error message', () => {
			const error = new Error('Test error');
			const result = formatErrorDetails(error);
			expect(result).toContain('Test error');
		});

		it('should include stack trace when available', () => {
			const error = new Error('Test error');
			error.stack = 'Error: Test error\n    at test.ts:1:1';
			const result = formatErrorDetails(error);
			expect(result).toContain('Stack Trace:');
			expect(result).toContain('at test.ts:1:1');
		});

		it('should include component stack when provided', () => {
			const error = new Error('Test error');
			const errorInfo = {
				componentStack: '\n    in MyComponent\n    in App',
				digest: null,
			};
			const result = formatErrorDetails(error, errorInfo);
			expect(result).toContain('Component Stack:');
			expect(result).toContain('MyComponent');
		});

		it('should handle error without stack trace', () => {
			const error = new Error('Test error');
			error.stack = undefined;
			const result = formatErrorDetails(error);
			expect(result).toContain('Test error');
			expect(result).not.toContain('Stack Trace:');
		});
	});

	describe('generateBugReportEmail', () => {
		it('should return a mailto link', () => {
			const result = generateBugReportEmail({
				error: new Error('Test error'),
				url: 'https://app.freedi.com/test',
			});
			expect(result).toContain('mailto:');
		});

		it('should include error message in body', () => {
			const result = generateBugReportEmail({
				error: new Error('Test error message'),
				url: 'https://app.freedi.com/test',
			});
			const decodedBody = decodeURIComponent(result);
			expect(decodedBody).toContain('Test error message');
		});

		it('should include URL in body', () => {
			const result = generateBugReportEmail({
				error: new Error('Test'),
				url: 'https://app.freedi.com/my-page',
			});
			const decodedBody = decodeURIComponent(result);
			expect(decodedBody).toContain('https://app.freedi.com/my-page');
		});

		it('should include stack trace in development mode', () => {
			const error = new Error('Dev error');
			error.stack = 'Error: Dev error\n    at dev.ts:10:5';
			const result = generateBugReportEmail({
				error,
				url: 'https://localhost:5173',
				isDevelopment: true,
			});
			const decodedBody = decodeURIComponent(result);
			expect(decodedBody).toContain('Stack Trace');
		});

		it('should not include stack trace in production mode', () => {
			const error = new Error('Prod error');
			error.stack = 'Error: Prod error\n    at prod.ts:10:5';
			const result = generateBugReportEmail({
				error,
				url: 'https://app.freedi.com',
				isDevelopment: false,
			});
			const decodedBody = decodeURIComponent(result);
			expect(decodedBody).not.toContain('Stack Trace');
		});

		it('should include subject line with error name', () => {
			const result = generateBugReportEmail({
				error: new TypeError('Type error'),
				url: 'https://app.freedi.com',
			});
			const decodedResult = decodeURIComponent(result);
			expect(decodedResult).toContain('Bug Report');
		});
	});
});
