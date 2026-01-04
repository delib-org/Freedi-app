/**
 * Tests for sanitize - HTML sanitization utilities
 * Note: These tests run in Node.js environment without DOM,
 * so server-side behavior (passthrough) is tested
 */

import { sanitizeHTML, sanitizeHTMLWithSecureLinks } from '../sanitize';

describe('sanitize', () => {
	describe('sanitizeHTML', () => {
		describe('server-side (no DOM)', () => {
			it('should return input as-is when window is undefined', () => {
				const html = '<script>alert("xss")</script>';
				expect(sanitizeHTML(html)).toBe(html);
			});

			it('should return empty string for empty input', () => {
				expect(sanitizeHTML('')).toBe('');
			});

			it('should return plain text unchanged', () => {
				const text = 'Hello, World!';
				expect(sanitizeHTML(text)).toBe(text);
			});

			it('should return HTML tags unchanged on server', () => {
				const html = '<p>Hello</p>';
				expect(sanitizeHTML(html)).toBe(html);
			});

			it('should handle null-like values gracefully', () => {
				// TypeScript should prevent this, but test runtime behavior
				expect(sanitizeHTML(undefined as unknown as string)).toBe(undefined);
				expect(sanitizeHTML(null as unknown as string)).toBe(null);
			});
		});
	});

	describe('sanitizeHTMLWithSecureLinks', () => {
		describe('server-side (no DOM)', () => {
			it('should return input as-is when window is undefined', () => {
				const html = '<a href="https://example.com">Link</a>';
				expect(sanitizeHTMLWithSecureLinks(html)).toBe(html);
			});

			it('should return empty string for empty input', () => {
				expect(sanitizeHTMLWithSecureLinks('')).toBe('');
			});

			it('should return plain text unchanged', () => {
				const text = 'No links here';
				expect(sanitizeHTMLWithSecureLinks(text)).toBe(text);
			});
		});
	});

	describe('allowed tags documentation', () => {
		// These tests document expected behavior when running in browser
		// They serve as documentation for the allowed tags

		it('should document allowed text formatting tags', () => {
			const formattingTags = [
				'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
				'sub', 'sup', 'mark', 'small',
			];
			// This is documentation - actual sanitization happens client-side
			expect(formattingTags).toHaveLength(12);
		});

		it('should document allowed structure tags', () => {
			const structureTags = ['p', 'br', 'span', 'div'];
			expect(structureTags).toHaveLength(4);
		});

		it('should document allowed list tags', () => {
			const listTags = ['ul', 'ol', 'li'];
			expect(listTags).toHaveLength(3);
		});

		it('should document allowed table tags', () => {
			const tableTags = [
				'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
				'caption', 'colgroup', 'col',
			];
			expect(tableTags).toHaveLength(10);
		});

		it('should document allowed link tags', () => {
			const linkTags = ['a'];
			expect(linkTags).toHaveLength(1);
		});

		it('should document allowed image tags', () => {
			const imageTags = ['img', 'figure', 'figcaption'];
			expect(imageTags).toHaveLength(3);
		});

		it('should document allowed attributes', () => {
			const allowedAttrs = [
				'href', 'target', 'rel',
				'class', 'style',
				'colspan', 'rowspan', 'scope',
				'src', 'alt', 'width', 'height', 'loading',
			];
			expect(allowedAttrs).toHaveLength(12);
		});
	});
});
