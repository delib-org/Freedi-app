/**
 * Tests for textUtils - text processing helpers
 * Focus: htmlToPreviewText, used to render document previews on the home page
 */

import { htmlToPreviewText, stripHtml, truncateText } from '../textUtils';

describe('textUtils', () => {
	describe('htmlToPreviewText', () => {
		it('should return an empty string for empty input', () => {
			expect(htmlToPreviewText('')).toBe('');
			expect(htmlToPreviewText(null)).toBe('');
			expect(htmlToPreviewText(undefined)).toBe('');
		});

		it('should remove inline formatting tags but keep their text', () => {
			expect(htmlToPreviewText('<strong>Bold</strong> and <em>italic</em>')).toBe(
				'Bold and italic'
			);
		});

		it('should remove tags with attributes', () => {
			expect(
				htmlToPreviewText('<span style="color:#1a5c38">Colored text</span>')
			).toBe('Colored text');
		});

		it('should insert a word boundary between block elements', () => {
			expect(htmlToPreviewText('<p>First</p><p>Second</p>')).toBe('First Second');
			expect(htmlToPreviewText('Line one<br>Line two')).toBe('Line one Line two');
			expect(htmlToPreviewText('Line one<br />Line two')).toBe('Line one Line two');
			expect(htmlToPreviewText('<li>One</li><li>Two</li>')).toBe('One Two');
		});

		it('should insert a word boundary between table cells', () => {
			expect(
				htmlToPreviewText('<table><tr><th>Header</th><td>Cell</td></tr></table>')
			).toBe('Header Cell');
		});

		it('should decode named HTML entities', () => {
			expect(htmlToPreviewText('He said &quot;hello&quot;')).toBe('He said "hello"');
			expect(htmlToPreviewText('Tom&#39;s file')).toBe("Tom's file");
			expect(htmlToPreviewText('Tom&apos;s file')).toBe("Tom's file");
			expect(htmlToPreviewText('Rock &amp; roll')).toBe('Rock & roll');
			expect(htmlToPreviewText('spaced&nbsp;out')).toBe('spaced out');
		});

		it('should decode numeric and hex entities', () => {
			expect(htmlToPreviewText('&#65;&#66;&#67;')).toBe('ABC');
			expect(htmlToPreviewText('&#x05D0;&#x05D1;')).toBe('אב');
		});

		it('should keep escaped markup as literal text', () => {
			expect(htmlToPreviewText('Use &lt;b&gt;bold&lt;/b&gt; here')).toBe(
				'Use <b>bold</b> here'
			);
		});

		it('should not double-decode &amp;lt;', () => {
			expect(htmlToPreviewText('&amp;lt;')).toBe('&lt;');
		});

		it('should collapse whitespace and trim', () => {
			expect(htmlToPreviewText('  <p>  lots   of\n\n space </p>  ')).toBe(
				'lots of space'
			);
		});

		it('should pass Hebrew RTL content through unchanged', () => {
			expect(htmlToPreviewText('<p>עקרונות היסוד לכינון חוקה בישראל</p>')).toBe(
				'עקרונות היסוד לכינון חוקה בישראל'
			);
		});

		it('should clean a real rich-text document description', () => {
			const description =
				'<strong>עקרונות היסוד לכינון חוקה בישראל</strong>: ' +
				'<span style="color:#1a5c38">כל האזרחים הם הריבון.</span>' +
				'<p>סמכות שלטונית נובעת מאזרחי המדינה ופועלת מטעמם בלבד.</p>' +
				'<table><tr><th><em>&quot;החוקה&quot;</em></th></tr></table>';

			const preview = htmlToPreviewText(description);

			expect(preview).not.toMatch(/<[^>]+>/);
			expect(preview).not.toContain('&quot;');
			expect(preview).toBe(
				'עקרונות היסוד לכינון חוקה בישראל: כל האזרחים הם הריבון. ' +
					'סמכות שלטונית נובעת מאזרחי המדינה ופועלת מטעמם בלבד. "החוקה"'
			);
		});
	});

	describe('stripHtml', () => {
		it('should strip tags and decode entities', () => {
			expect(stripHtml('<p>Hello &amp; welcome</p>')).toBe('Hello & welcome');
		});

		it('should return an empty string for empty input', () => {
			expect(stripHtml('')).toBe('');
		});
	});

	describe('truncateText', () => {
		it('should leave short text untouched', () => {
			expect(truncateText('short', 10)).toBe('short');
		});

		it('should truncate long text with an ellipsis', () => {
			expect(truncateText('abcdefghij', 5)).toBe('abcde...');
		});
	});
});
