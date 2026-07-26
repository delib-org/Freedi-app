import { adaptRichHtmlColorsToColorScheme, containsRichHtml, sanitizeRichHtml } from '../richHtml';

describe('richHtml', () => {
	describe('containsRichHtml', () => {
		it('returns false for plain text', () => {
			expect(containsRichHtml('Just a plain statement')).toBe(false);
			expect(containsRichHtml('שלום עולם')).toBe(false);
		});

		it('returns false for empty/undefined/null', () => {
			expect(containsRichHtml('')).toBe(false);
			expect(containsRichHtml(undefined)).toBe(false);
			expect(containsRichHtml(null)).toBe(false);
		});

		it('returns false for math-like comparisons that are not tags', () => {
			expect(containsRichHtml('x < y and y > z')).toBe(false);
			expect(containsRichHtml('5<6')).toBe(false);
		});

		it('returns true for HTML tags', () => {
			expect(containsRichHtml('<span style="color:#1a5c38"><strong>4.1</strong></span>')).toBe(
				true,
			);
			expect(containsRichHtml('line one<br>line two')).toBe(true);
			expect(containsRichHtml('<table><tr><td>cell</td></tr></table>')).toBe(true);
		});

		it('returns true for HTML entities (so they get decoded)', () => {
			expect(containsRichHtml('צמ&quot;ד')).toBe(true);
			expect(containsRichHtml('it&#39;s')).toBe(true);
			expect(containsRichHtml('a &amp; b')).toBe(true);
		});
	});

	describe('sanitizeRichHtml', () => {
		it('renders HTML instead of escaping it (keeps formatting tags)', () => {
			const input = '<span style="color:#1a5c38"><strong>4.1 מפת הגורמים</strong></span>';
			const output = sanitizeRichHtml(input);
			expect(output).toContain('<strong>');
			expect(output).toContain('<span');
			expect(output).not.toContain('&lt;span');
		});

		it('preserves inline styles on spans (colors)', () => {
			const output = sanitizeRichHtml('<span style="color:#1a5c38">green</span>');
			expect(output).toContain('style="color:#1a5c38"');
		});

		it('preserves tables, colgroup/col column widths and cell backgrounds', () => {
			const input =
				'<table><colgroup><col style="width:60.0%"><col style="width:40.0%"></colgroup>' +
				'<tr><td style="background-color:#1a5c38;text-align:center">A</td><td>B</td></tr></table>';
			const output = sanitizeRichHtml(input);
			expect(output).toContain('<table>');
			expect(output).toContain('<colgroup>');
			expect(output).toContain('width:60.0%');
			expect(output).toContain('background-color:#1a5c38');
			expect(output).toContain('colgroup');
		});

		it('preserves colspan/rowspan', () => {
			const output = sanitizeRichHtml('<table><tr><td colspan="2" rowspan="3">x</td></tr></table>');
			expect(output).toContain('colspan="2"');
			expect(output).toContain('rowspan="3"');
		});

		it('decodes HTML entities when the output is rendered as HTML', () => {
			// The sanitized string is injected via innerHTML, so entities must
			// resolve to their characters in the rendered DOM.
			const renderedText = (html: string): string => {
				const div = document.createElement('div');
				div.innerHTML = sanitizeRichHtml(html);

				return div.textContent ?? '';
			};

			expect(renderedText('צמ&quot;ד')).toBe('צמ"ד');
			expect(renderedText('<p>it&#39;s fine</p>')).toBe("it's fine");
		});

		// SECURITY
		it('strips <script> tags', () => {
			const output = sanitizeRichHtml('<p>ok</p><script>alert("xss")</script>');
			expect(output).not.toContain('<script');
			expect(output).not.toContain('alert');
			expect(output).toContain('<p>ok</p>');
		});

		it('strips event-handler attributes (onerror, onclick)', () => {
			const output = sanitizeRichHtml(
				'<img src="x" onerror="alert(1)"><div onclick="steal()">hi</div>',
			);
			expect(output).not.toContain('onerror');
			expect(output).not.toContain('onclick');
		});

		it('strips javascript: URLs from links', () => {
			const output = sanitizeRichHtml('<a href="javascript:alert(1)">click</a>');
			expect(output).not.toContain('javascript:');
		});

		it('strips iframe/object/embed', () => {
			const output = sanitizeRichHtml(
				'<iframe src="https://evil.example"></iframe><object></object><embed>',
			);
			expect(output).not.toContain('<iframe');
			expect(output).not.toContain('<object');
			expect(output).not.toContain('<embed');
		});

		it('forces links to open in a new tab with noopener noreferrer', () => {
			const output = sanitizeRichHtml('<a href="https://example.com">link</a>');
			expect(output).toContain('target="_blank"');
			expect(output).toContain('rel="noopener noreferrer"');
		});

		it('wraps tables in the given wrapper class for horizontal scrolling', () => {
			const output = sanitizeRichHtml('<table><tr><td>wide</td></tr></table>', {
				tableWrapperClass: 'tableWrap',
			});
			expect(output).toContain('<div class="tableWrap"><table>');
		});

		it('leaves plain text untouched', () => {
			expect(sanitizeRichHtml('hello world')).toBe('hello world');
		});
	});

	describe('adaptRichHtmlColorsToColorScheme', () => {
		it('rewrites inline text colors into light-dark pairs with the original as fallback', () => {
			const output = adaptRichHtmlColorsToColorScheme('<span style="color:#1a1a1a">body</span>');
			// Original declaration retained first (fallback for browsers
			// without light-dark()/relative-color support).
			expect(output).toContain('color:#1a1a1a;');
			expect(output).toContain(
				'color:light-dark(#1a1a1a, oklch(from #1a1a1a calc(max(l, 0.8)) c h))',
			);
		});

		it('caps inline background colors instead of lifting them', () => {
			const output = adaptRichHtmlColorsToColorScheme(
				'<table><tbody><tr><td style="background-color:#d8f0e3">cell</td></tr></tbody></table>',
			);
			expect(output).toContain(
				'background-color:light-dark(#d8f0e3, oklch(from #d8f0e3 calc(min(l, 0.3)) c h))',
			);
		});

		it('adapts both properties on the same element and keeps other declarations', () => {
			const output = adaptRichHtmlColorsToColorScheme(
				'<table><tbody><tr><th style="width:120px;background-color:#1a5c38;color:#ffffff">head</th></tr></tbody></table>',
			);
			expect(output).toContain('width:120px');
			expect(output).toContain('background-color:light-dark(#1a5c38,');
			expect(output).toContain('color:light-dark(#ffffff,');
		});

		it('leaves non-adaptable values (keywords, gradients, var()) untouched', () => {
			const transparent = '<span style="color:transparent">x</span>';
			expect(adaptRichHtmlColorsToColorScheme(transparent)).toBe(transparent);

			const gradient = '<div style="background:linear-gradient(red, blue)">x</div>';
			expect(adaptRichHtmlColorsToColorScheme(gradient)).toBe(gradient);

			const varColor = '<span style="color:var(--text-body)">x</span>';
			expect(adaptRichHtmlColorsToColorScheme(varColor)).toBe(varColor);
		});

		it('is idempotent (already-adapted markup is not double-wrapped)', () => {
			const once = adaptRichHtmlColorsToColorScheme('<span style="color:#555555">x</span>');
			expect(adaptRichHtmlColorsToColorScheme(once)).toBe(once);
		});

		it('returns markup without style attributes unchanged', () => {
			const plain = '<p>hello <strong>world</strong></p>';
			expect(adaptRichHtmlColorsToColorScheme(plain)).toBe(plain);
		});

		it('does not touch non-color declarations (colgroup widths preserved)', () => {
			const widths =
				'<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tbody><tr><td>x</td></tr></tbody></table>';
			expect(adaptRichHtmlColorsToColorScheme(widths)).toBe(widths);
		});
	});
});
