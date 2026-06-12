import { describe, expect, it } from 'vitest';
import { formatLabeledLink, isHttpUrl, parseMessageSegments, pastedUrl } from '../links';

describe('links', () => {
	describe('isHttpUrl', () => {
		it('accepts http and https URLs', () => {
			expect(isHttpUrl('https://google.com')).toBe(true);
			expect(isHttpUrl('http://example.org/path?q=1')).toBe(true);
		});

		it('rejects non-http schemes and prose', () => {
			expect(isHttpUrl('javascript:alert(1)')).toBe(false);
			expect(isHttpUrl('ftp://files.example.com')).toBe(false);
			expect(isHttpUrl('check https://google.com out')).toBe(false);
			expect(isHttpUrl('not a url')).toBe(false);
		});
	});

	describe('pastedUrl', () => {
		it('returns the URL when the paste is exactly one URL', () => {
			expect(pastedUrl('  https://google.com \n')).toBe('https://google.com');
		});

		it('returns null for prose containing a URL', () => {
			expect(pastedUrl('see https://google.com please')).toBeNull();
		});
	});

	describe('formatLabeledLink', () => {
		it('serializes the storage format', () => {
			expect(formatLabeledLink('Google', 'https://google.com')).toBe(
				'[Google](https://google.com)',
			);
		});

		it('strips characters that would break the syntax', () => {
			expect(formatLabeledLink('a]b[c', 'https://x.com')).toBe('[a b c](https://x.com)');
		});
	});

	describe('parseMessageSegments', () => {
		it('returns plain text untouched', () => {
			expect(parseMessageSegments('hello world')).toEqual([{ type: 'text', text: 'hello world' }]);
		});

		it('parses a labeled link with surrounding text', () => {
			expect(parseMessageSegments('see [Google](https://google.com) now')).toEqual([
				{ type: 'text', text: 'see ' },
				{ type: 'link', label: 'Google', url: 'https://google.com' },
				{ type: 'text', text: ' now' },
			]);
		});

		it('parses a bare URL and trims trailing punctuation', () => {
			expect(parseMessageSegments('look at https://google.com/a.')).toEqual([
				{ type: 'text', text: 'look at ' },
				{ type: 'link', label: 'https://google.com/a', url: 'https://google.com/a' },
				{ type: 'text', text: '.' },
			]);
		});

		it('parses multiple links', () => {
			const segments = parseMessageSegments(
				'[A](https://a.com) and https://b.com',
			);
			expect(segments).toEqual([
				{ type: 'link', label: 'A', url: 'https://a.com' },
				{ type: 'text', text: ' and ' },
				{ type: 'link', label: 'https://b.com', url: 'https://b.com' },
			]);
		});

		it('leaves non-http schemes as plain text', () => {
			expect(parseMessageSegments('[x](javascript:alert(1))')).toEqual([
				{ type: 'text', text: '[x](javascript:alert(1))' },
			]);
		});

		it('handles empty text', () => {
			expect(parseMessageSegments('')).toEqual([{ type: 'text', text: '' }]);
		});
	});
});
