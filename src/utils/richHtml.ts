/**
 * Rich HTML helpers for Sign-authored document content.
 *
 * Sign documents (often Google Docs imports) store paragraph content as HTML:
 * colored spans, tables with per-column widths, cell background colors, and
 * HTML entities. This module is the ONE main-app sanitize config for that
 * content. The allowlist mirrors the Sign app's sanitizer
 * (apps/sign/src/lib/utils/sanitize.ts) so both apps agree on what markup
 * survives — critically, inline `style` on spans/cells and full table markup
 * (table/colgroup/col/tr/td/th) must be preserved or colors and column widths
 * are lost.
 *
 * ALWAYS render Sign-authored HTML through `sanitizeRichHtml` (directly or via
 * the RichHtmlContent component) — never inject unsanitized HTML.
 */

import DOMPurifyDefault from 'dompurify';
import * as DOMPurifyModule from 'dompurify';

// dompurify ships CJS without a runtime `default` export; Vite adds the
// interop but ts-jest does not — fall back to the module object itself.
const DOMPurify = DOMPurifyDefault ?? (DOMPurifyModule as unknown as typeof DOMPurifyDefault);

/**
 * Tags allowed in Sign-authored rich content.
 * Keep in sync with apps/sign/src/lib/utils/sanitize.ts.
 */
export const RICH_HTML_ALLOWED_TAGS: string[] = [
	// Text formatting
	'b',
	'strong',
	'i',
	'em',
	'u',
	's',
	'strike',
	'del',
	'sub',
	'sup',
	'mark',
	'small',
	// Structure
	'p',
	'br',
	'span',
	'div',
	// Lists (for table content)
	'ul',
	'ol',
	'li',
	// Tables
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'th',
	'td',
	'caption',
	'colgroup',
	'col',
	// Links
	'a',
	// Images
	'img',
	'figure',
	'figcaption',
];

/**
 * Attributes allowed in Sign-authored rich content.
 * Keep in sync with apps/sign/src/lib/utils/sanitize.ts.
 */
export const RICH_HTML_ALLOWED_ATTR: string[] = [
	'href',
	'target',
	'rel',
	'class',
	'style',
	'colspan',
	'rowspan',
	'scope',
	// Image attributes
	'src',
	'alt',
	'width',
	'height',
	'loading',
];

/** Matches a real HTML tag, e.g. `<span style="...">`, `</td>`, `<br/>`. */
const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;

/** Matches HTML character references, e.g. `&quot;`, `&#39;`, `&#x27;`. */
const HTML_ENTITY_PATTERN = /&(?:[a-z][a-z0-9]{1,9}|#\d{1,7}|#x[0-9a-f]{1,6});/i;

/**
 * True when the text carries HTML markup or entities and should be rendered
 * as (sanitized) HTML rather than plain text. Plain prose — including things
 * like "x < y" — stays false, so ordinary statements keep the plain-text path.
 */
export function containsRichHtml(text: string | undefined | null): boolean {
	if (!text) return false;

	return HTML_TAG_PATTERN.test(text) || HTML_ENTITY_PATTERN.test(text);
}

interface SanitizeRichHtmlOptions {
	/**
	 * When provided, each `<table>` in the output is wrapped in a
	 * `<div class="...">` with this class so wide tables can scroll
	 * horizontally instead of overflowing their card.
	 */
	tableWrapperClass?: string;
}

/**
 * Sanitizes Sign-authored rich HTML for safe rendering in the main app.
 *
 * - Strips scripts, event-handler attributes and `javascript:` URLs.
 * - Preserves inline `style` (span colors, cell backgrounds, column widths)
 *   and full table markup, matching the Sign app's allowlist.
 * - Decodes HTML entities as a side effect of parsing (`&quot;` → `"`).
 * - Forces links to open in a new tab with `rel="noopener noreferrer"`.
 */
export function sanitizeRichHtml(html: string, options?: SanitizeRichHtmlOptions): string {
	const sanitized = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: RICH_HTML_ALLOWED_TAGS,
		ALLOWED_ATTR: RICH_HTML_ALLOWED_ATTR,
		FORCE_BODY: true,
		ADD_ATTR: ['target'],
	});

	const needsPostProcessing = sanitized.includes('<a') || sanitized.includes('<table');
	if (!needsPostProcessing) return sanitized;

	const container = document.createElement('div');
	container.innerHTML = sanitized;

	// Secure links (mirrors Sign's sanitizeHTMLWithSecureLinks).
	container.querySelectorAll('a').forEach((link) => {
		link.setAttribute('target', '_blank');
		link.setAttribute('rel', 'noopener noreferrer');
	});

	// Wrap tables so wide content scrolls inside its own container.
	if (options?.tableWrapperClass) {
		container.querySelectorAll('table').forEach((table) => {
			const parent = table.parentElement;
			if (parent?.classList.contains(options.tableWrapperClass as string)) return;
			const wrapper = document.createElement('div');
			wrapper.className = options.tableWrapperClass as string;
			table.replaceWith(wrapper);
			wrapper.appendChild(table);
		});
	}

	return container.innerHTML;
}
