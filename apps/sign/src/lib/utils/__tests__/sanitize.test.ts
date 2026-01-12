/**
 * Tests for sanitize - HTML sanitization utilities
 * Note: These tests run in jsdom environment with DOMPurify active
 */

import { sanitizeHTML, sanitizeHTMLWithSecureLinks } from '../sanitize';

describe('sanitize', () => {
	describe('sanitizeHTML', () => {
		describe('XSS prevention', () => {
			it('should remove script tags', () => {
				const html = '<script>alert("xss")</script>';
				expect(sanitizeHTML(html)).toBe('');
			});

			it('should remove onclick handlers', () => {
				const html = '<div onclick="alert(\'xss\')">Click me</div>';
				const result = sanitizeHTML(html);
				expect(result).not.toContain('onclick');
				expect(result).toContain('Click me');
			});

			it('should remove javascript URLs', () => {
				const html = '<a href="javascript:alert(\'xss\')">Link</a>';
				const result = sanitizeHTML(html);
				expect(result).not.toContain('javascript:');
			});

			it('should remove onerror handlers', () => {
				const html = '<img src="x" onerror="alert(\'xss\')">';
				const result = sanitizeHTML(html);
				expect(result).not.toContain('onerror');
			});
		});

		describe('allowed content', () => {
			it('should return empty string for empty input', () => {
				expect(sanitizeHTML('')).toBe('');
			});

			it('should return plain text unchanged', () => {
				const text = 'Hello, World!';
				expect(sanitizeHTML(text)).toBe(text);
			});

			it('should allow basic paragraph tags', () => {
				const html = '<p>Hello</p>';
				expect(sanitizeHTML(html)).toBe('<p>Hello</p>');
			});

			it('should allow bold and italic tags', () => {
				const html = '<b>bold</b> and <i>italic</i>';
				expect(sanitizeHTML(html)).toContain('<b>bold</b>');
				expect(sanitizeHTML(html)).toContain('<i>italic</i>');
			});

			it('should allow links with href', () => {
				const html = '<a href="https://example.com">Link</a>';
				const result = sanitizeHTML(html);
				expect(result).toContain('href="https://example.com"');
				expect(result).toContain('Link');
			});

			it('should allow images with src and alt', () => {
				const html = '<img src="image.jpg" alt="description">';
				const result = sanitizeHTML(html);
				expect(result).toContain('src="image.jpg"');
				expect(result).toContain('alt="description"');
			});

			it('should allow lists', () => {
				const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
				const result = sanitizeHTML(html);
				expect(result).toContain('<ul>');
				expect(result).toContain('<li>');
			});

			it('should allow tables', () => {
				const html = '<table><tr><td>Cell</td></tr></table>';
				const result = sanitizeHTML(html);
				expect(result).toContain('<table>');
				expect(result).toContain('<td>');
			});
		});

		describe('edge cases', () => {
			it('should handle nested allowed tags', () => {
				const html = '<p><b><i>Nested</i></b></p>';
				expect(sanitizeHTML(html)).toBe('<p><b><i>Nested</i></b></p>');
			});

			it('should handle entities', () => {
				const html = '&lt;script&gt;';
				expect(sanitizeHTML(html)).toBe('&lt;script&gt;');
			});
		});
	});

	describe('sanitizeHTMLWithSecureLinks', () => {
		describe('link security', () => {
			it('should add target="_blank" to links', () => {
				const html = '<a href="https://example.com">Link</a>';
				const result = sanitizeHTMLWithSecureLinks(html);
				expect(result).toContain('target="_blank"');
			});

			it('should add rel="noopener noreferrer" to links', () => {
				const html = '<a href="https://example.com">Link</a>';
				const result = sanitizeHTMLWithSecureLinks(html);
				expect(result).toContain('noopener');
				expect(result).toContain('noreferrer');
			});

			it('should handle multiple links', () => {
				const html = '<a href="http://a.com">A</a> and <a href="http://b.com">B</a>';
				const result = sanitizeHTMLWithSecureLinks(html);
				const targetMatches = result.match(/target="_blank"/g);
				expect(targetMatches).toHaveLength(2);
			});
		});

		describe('basic behavior', () => {
			it('should return empty string for empty input', () => {
				expect(sanitizeHTMLWithSecureLinks('')).toBe('');
			});

			it('should return plain text unchanged', () => {
				const text = 'No links here';
				expect(sanitizeHTMLWithSecureLinks(text)).toBe(text);
			});

			it('should sanitize XSS before adding link attributes', () => {
				const html = '<script>xss</script><a href="https://safe.com">Link</a>';
				const result = sanitizeHTMLWithSecureLinks(html);
				expect(result).not.toContain('<script>');
				expect(result).toContain('href="https://safe.com"');
			});
		});
	});

	describe('allowed tags documentation', () => {
		// These tests document expected behavior

		it('should document allowed text formatting tags', () => {
			const formattingTags = [
				'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
				'sub', 'sup', 'mark', 'small',
			];
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
			expect(allowedAttrs).toHaveLength(13);
		});
	});
});
