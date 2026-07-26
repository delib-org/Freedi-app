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

// ============================================================================
// Dark-mode adaptation of Sign-authored inline colors
// ============================================================================
//
// Sign documents carry HARDCODED inline colors chosen for Sign's light page
// (near-black body text like #1a1a1a, greys like #555555, dark accent
// headings like #1a5c38, and light table-cell background tints). Rendered on
// the main app's dark theme those dark inks land on a dark card and become
// unreadable.
//
// Approach: rewrite each inline `color` / `background-color` declaration to
//
//   color: <original>;
//   color: light-dark(<original>, oklch(from <original> calc(max(l, Lmin)) c h));
//
// so the browser resolves the ORIGINAL value under the light scheme (light
// mode stays pixel-identical) and a LUMINANCE-CLAMPED value under the dark
// scheme (`:root` sets `color-scheme: dark` there — see _variables-dark.scss).
// Text colors are lifted to a minimum OKLCH lightness and backgrounds capped
// to a maximum, both PRESERVING hue and chroma, so a dark-green heading stays
// green (emphasis intact) and a tinted header cell keeps its tint as a dark
// shade. Clamping text up and surfaces down guarantees the two never meet:
// worst-case pairs stay above WCAG AA (4.5:1) — see the values below.
//
// The duplicated declaration is deliberate: browsers without light-dark() /
// relative-color support drop the second declaration and keep the original —
// exactly today's behavior, no regression. No `!important`, no sanitizer
// changes (this runs on already-sanitized markup and only touches the two
// color properties inside existing style attributes).

/**
 * Minimum OKLCH lightness for inline TEXT colors in dark mode. 0.8 keeps
 * ~8:1 against the dark card (#1c2434) for neutral inks and >6:1 for
 * saturated hues — comfortably past WCAG AA.
 */
const DARK_TEXT_MIN_LIGHTNESS = 0.8;

/**
 * Maximum OKLCH lightness for inline BACKGROUND colors in dark mode. 0.3
 * keeps clamped text (>= 0.8 L) above ~5:1 on the darkened surface while the
 * surface still reads as a tinted cell against the card.
 */
const DARK_BG_MAX_LIGHTNESS = 0.3;

/** A single color literal: hex, rgb()/hsl() function, or a color keyword. */
const SIMPLE_COLOR_VALUE_PATTERN = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^()]*\)|[a-z]+)$/i;

/** Values that must never be wrapped in a relative-color expression. */
const NON_ADAPTABLE_COLOR_KEYWORDS = new Set([
	'inherit',
	'initial',
	'unset',
	'revert',
	'currentcolor',
	'transparent',
]);

function isAdaptableColorValue(value: string): boolean {
	if (NON_ADAPTABLE_COLOR_KEYWORDS.has(value.toLowerCase())) return false;

	return SIMPLE_COLOR_VALUE_PATTERN.test(value);
}

/** Lifts a text color to a readable lightness under the dark scheme only. */
function schemeAdaptiveTextColor(value: string): string {
	return `light-dark(${value}, oklch(from ${value} calc(max(l, ${DARK_TEXT_MIN_LIGHTNESS})) c h))`;
}

/** Caps a surface color to a dark lightness under the dark scheme only. */
function schemeAdaptiveSurfaceColor(value: string): string {
	return `light-dark(${value}, oklch(from ${value} calc(min(l, ${DARK_BG_MAX_LIGHTNESS})) c h))`;
}

const SCHEME_ADAPTIVE_PROPERTIES: Record<string, (value: string) => string> = {
	color: schemeAdaptiveTextColor,
	'background-color': schemeAdaptiveSurfaceColor,
	background: schemeAdaptiveSurfaceColor, // only when the value is a lone color
};

function adaptStyleDeclarations(style: string): string {
	return style
		.split(';')
		.map((declaration) => {
			const separatorIndex = declaration.indexOf(':');
			if (separatorIndex === -1) return declaration;

			const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
			const value = declaration.slice(separatorIndex + 1).trim();
			const adapt = SCHEME_ADAPTIVE_PROPERTIES[property];
			if (!adapt || !value || !isAdaptableColorValue(value)) return declaration;

			// Original kept first as the no-support fallback (see block comment).
			return `${property}:${value};${property}:${adapt(value)}`;
		})
		.join(';');
}

/**
 * Rewrites inline `color` / `background-color` declarations in sanitized
 * Sign-authored HTML into scheme-adaptive pairs so the content stays readable
 * on the dark theme while remaining pixel-identical in light mode. Call with
 * ALREADY-SANITIZED markup (output of `sanitizeRichHtml`).
 */
export function adaptRichHtmlColorsToColorScheme(html: string): string {
	if (!html.includes('style=')) return html;

	const container = document.createElement('div');
	container.innerHTML = html;

	container.querySelectorAll('[style]').forEach((element) => {
		const style = element.getAttribute('style');
		if (!style || style.includes('light-dark(')) return;

		const adapted = adaptStyleDeclarations(style);
		if (adapted !== style) element.setAttribute('style', adapted);
	});

	return container.innerHTML;
}
