/**
 * Tests for URL helper utilities
 */

import {
	detectUrls,
	containsUrl,
	extractDomain,
	isValidUrl,
	getSignDocumentUrl,
	getSignAdminUrl,
	canOpenInSignApp,
} from '../urlHelpers';

describe('urlHelpers', () => {
	describe('detectUrls', () => {
		it('should detect single URL in text', () => {
			const text = 'Check out https://example.com for more info';
			const urls = detectUrls(text);

			expect(urls).toEqual(['https://example.com']);
		});

		it('should detect multiple URLs in text', () => {
			const text = 'Visit https://example.com and http://test.org';
			const urls = detectUrls(text);

			expect(urls).toEqual(['https://example.com', 'http://test.org']);
		});

		it('should return empty array for text without URLs', () => {
			const text = 'This text has no URLs';
			const urls = detectUrls(text);

			expect(urls).toEqual([]);
		});

		it('should detect URLs with paths', () => {
			const text = 'Link: https://example.com/path/to/page';
			const urls = detectUrls(text);

			expect(urls).toEqual(['https://example.com/path/to/page']);
		});

		it('should detect URLs with query parameters', () => {
			const text = 'Link: https://example.com/search?q=test&page=1';
			const urls = detectUrls(text);

			expect(urls).toEqual(['https://example.com/search?q=test&page=1']);
		});

		it('should handle empty string', () => {
			const urls = detectUrls('');

			expect(urls).toEqual([]);
		});

		it('should not detect non-URL text that looks like URLs', () => {
			const text = 'example.com is not a valid URL without protocol';
			const urls = detectUrls(text);

			expect(urls).toEqual([]);
		});
	});

	describe('containsUrl', () => {
		it('should return true for text with URL', () => {
			expect(containsUrl('Visit https://example.com')).toBe(true);
		});

		it('should return false for text without URL', () => {
			expect(containsUrl('No URLs here')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(containsUrl('')).toBe(false);
		});

		it('should return true for text with multiple URLs', () => {
			expect(containsUrl('https://a.com and https://b.com')).toBe(true);
		});
	});

	describe('extractDomain', () => {
		it('should extract domain from valid URL', () => {
			expect(extractDomain('https://example.com/path')).toBe('example.com');
		});

		it('should extract domain with subdomain', () => {
			expect(extractDomain('https://www.example.com')).toBe('www.example.com');
		});

		it('should extract domain from URL with port', () => {
			expect(extractDomain('https://example.com:8080/path')).toBe('example.com');
		});

		it('should return empty string for invalid URL', () => {
			expect(extractDomain('not a url')).toBe('');
		});

		it('should return empty string for empty string', () => {
			expect(extractDomain('')).toBe('');
		});

		it('should handle URLs with authentication', () => {
			expect(extractDomain('https://user:pass@example.com/path')).toBe('example.com');
		});
	});

	describe('isValidUrl', () => {
		it('should return true for valid https URL', () => {
			expect(isValidUrl('https://example.com')).toBe(true);
		});

		it('should return true for valid http URL', () => {
			expect(isValidUrl('http://example.com')).toBe(true);
		});

		it('should return true for URL with path', () => {
			expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
		});

		it('should return true for URL with query string', () => {
			expect(isValidUrl('https://example.com?foo=bar')).toBe(true);
		});

		it('should return false for invalid URL', () => {
			expect(isValidUrl('not a url')).toBe(false);
		});

		it('should return false for URL without protocol', () => {
			expect(isValidUrl('example.com')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isValidUrl('')).toBe(false);
		});

		it('should return true for localhost URL', () => {
			expect(isValidUrl('http://localhost:3000')).toBe(true);
		});

		it('should return true for IP address URL', () => {
			expect(isValidUrl('http://192.168.1.1:8080')).toBe(true);
		});
	});

	describe('getSignDocumentUrl', () => {
		it('should return correct Sign app document URL', () => {
			const url = getSignDocumentUrl('stmt-123');

			expect(url).toContain('/doc/stmt-123');
			expect(url).toMatch(/^https?:\/\//);
		});

		it('should handle statement IDs with special characters', () => {
			const url = getSignDocumentUrl('stmt-123-abc');

			expect(url).toContain('/doc/stmt-123-abc');
		});
	});

	describe('getSignAdminUrl', () => {
		it('should return correct Sign app admin URL', () => {
			const url = getSignAdminUrl('stmt-123');

			expect(url).toContain('/doc/stmt-123/admin');
			expect(url).toMatch(/^https?:\/\//);
		});

		it('should handle statement IDs with special characters', () => {
			const url = getSignAdminUrl('stmt-123-abc');

			expect(url).toContain('/doc/stmt-123-abc/admin');
		});
	});

	describe('canOpenInSignApp', () => {
		it('should return true for option type', () => {
			expect(canOpenInSignApp('option')).toBe(true);
		});

		it('should return true for document type', () => {
			expect(canOpenInSignApp('document')).toBe(true);
		});

		it('should return true for question type', () => {
			expect(canOpenInSignApp('question')).toBe(true);
		});

		it('should return false for statement type', () => {
			expect(canOpenInSignApp('statement')).toBe(false);
		});

		it('should return false for group type', () => {
			expect(canOpenInSignApp('group')).toBe(false);
		});

		it('should return false for unknown type', () => {
			expect(canOpenInSignApp('unknown')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(canOpenInSignApp('')).toBe(false);
		});
	});
});
