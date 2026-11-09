/**
 * System bar sync (PWA status bar).
 *
 * The browser paints the status bar of an installed app from
 * `<meta name="theme-color">`. We keep that tag equal to the background of the
 * screen header while it is at the top of the screen, else the page
 * background. Colours come from computed styles, so light, dark and high
 * contrast (resolved by the design tokens) are followed with no duplicated
 * hexes. Nothing but the header and the page is read, so toasts, sheets,
 * floating buttons and scrolled content cannot leak into the bar.
 *
 * LIMITS: `theme-color` drives only the TOP bar. The Android navigation bar
 * comes from the web manifest (public/manifest.json), fixed at install or
 * WebAPK refresh, so it cannot follow the app live. Whether iOS standalone
 * honours live updates is unverified.
 */
import { OPAQUE_THRESHOLD, parseCssColor, rgbaToHex } from './systemBarColors';

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';
const INITIAL_ATTRIBUTE = 'data-initial-content';
const TOP_TOLERANCE_PX = 1;

/**
 * Screen headers, by their stable global classes (CSS-module classes are
 * hashed):
 * - `.page__header`: statement / question screens, subscriptions, engagement,
 *   GeneralHeader. Its coloured card is `.page__header__full` when present.
 * - `.homePage__header`: the home row. Full width, opaque (`--space-paper`).
 *   The `--nav-floating-bg` pill in HomeHeader is only the avatar disc.
 * - `.app-header`: my-suggestions and other pages built on the global bar.
 * Screens with no header at the top (/my, notification settings) fall back to
 * the page background, which is what they show there.
 */
export const HEADER_SELECTOR = '.page__header, .homePage__header, .app-header';
const HEADER_BODY_SELECTOR = '.page__header__full';

/**
 * Walks from `start` up to the root and returns the first opaque background
 * as `#rrggbb`. Transparent and translucent layers are skipped. A colour we
 * cannot parse (oklch, color-mix, named) stops the walk with null: guessing
 * from an ancestor could show another surface's colour.
 */
export function findOpaqueBackground(
	start: Element | null,
	getBackground: (element: Element) => string,
): string | null {
	let element: Element | null = start;

	while (element) {
		const raw = getBackground(element);
		const color = parseCssColor(raw);

		if (color && color.a >= OPAQUE_THRESHOLD) return rgbaToHex(color);
		if (!color && raw && raw !== 'transparent') return null;
		element = element.parentElement;
	}

	return null;
}

/** Elements whose class/style change can recolour the header (not their subtrees). */
export function getHeaderElements(doc: Document): Element[] {
	const headers = Array.from(doc.querySelectorAll(HEADER_SELECTOR));
	const bodies = headers
		.map((header) => header.querySelector(HEADER_BODY_SELECTOR))
		.filter((element): element is Element => element !== null);

	return [...headers, ...bodies];
}

function isAtTop(element: Element): boolean {
	const rect = element.getBoundingClientRect();

	return rect.height > 0 && rect.top <= TOP_TOLERANCE_PX && rect.bottom > 0;
}

/** Header colour while it is at the top, else the page background, else null. */
export function resolveStatusBarColor(doc: Document, win: Window): string | null {
	const getBackground = (element: Element): string => win.getComputedStyle(element).backgroundColor;
	const header = Array.from(doc.querySelectorAll(HEADER_SELECTOR)).find(isAtTop);

	if (header) {
		const fromHeader = findOpaqueBackground(
			header.querySelector(HEADER_BODY_SELECTOR) ?? header,
			getBackground,
		);

		if (fromHeader) return fromHeader;
	}

	return findOpaqueBackground(doc.body, getBackground);
}

function getThemeMetas(doc: Document): HTMLMetaElement[] {
	return Array.from(doc.querySelectorAll<HTMLMetaElement>(THEME_COLOR_SELECTOR));
}

/**
 * Writes `color` into every theme-color meta (index.html has one per colour
 * scheme for the first paint; all get the same value so they never disagree).
 * Remembers each meta's first-paint value. Returns true when something changed.
 */
export function applyThemeColor(doc: Document, color: string): boolean {
	let metas = getThemeMetas(doc);

	if (metas.length === 0) {
		const created = doc.createElement('meta');

		created.name = 'theme-color';
		doc.head.appendChild(created);
		metas = [created];
	}

	let changed = false;

	for (const meta of metas) {
		if (!meta.hasAttribute(INITIAL_ATTRIBUTE)) meta.setAttribute(INITIAL_ATTRIBUTE, meta.content);

		if (meta.content !== color) {
			meta.content = color;
			changed = true;
		}
	}

	return changed;
}

/**
 * Failed-read fallback: put every meta back to its own first-paint value, so
 * each scheme-specific tag is again correct for its media query and the set
 * is never left half-updated.
 */
export function restoreInitialThemeColor(doc: Document): void {
	for (const meta of getThemeMetas(doc)) {
		const initial = meta.getAttribute(INITIAL_ATTRIBUTE);

		if (initial !== null) meta.content = initial;
	}
}

/** Reads the current colours and updates the status bar. */
export function syncStatusBarColor(doc: Document, win: Window): void {
	const color = resolveStatusBarColor(doc, win);

	if (color) applyThemeColor(doc, color);
	else restoreInitialThemeColor(doc);
}
