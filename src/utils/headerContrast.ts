/**
 * Header contrast utilities.
 *
 * Statement headers are tinted with an accent token that can be ANY lightness
 * (option yellow, question blue, group purple, home blue...). Icons and text
 * drawn on that bar must flip between a light and a dark ink based on the
 * HEADER BACKGROUND's luminance — not the app theme — otherwise fixed white
 * icons disappear on light accents (e.g. the option-yellow header, which got
 * worse in dark mode where --option-text flips to a light color for cards).
 *
 * `getHeaderContrastInk` resolves the accent (CSS custom property or literal
 * color), measures WCAG relative luminance, and returns one of two paired ink
 * tokens defined in `src/view/style/_variables.scss`:
 *   --header-ink-on-light  (dark ink for light accents)
 *   --header-ink-on-dark   (light ink for dark accents)
 */

interface Rgb {
	r: number;
	g: number;
	b: number;
}

/** Ink tokens paired with header accents. Fallbacks mirror _variables.scss. */
export const HEADER_INK_ON_LIGHT = 'var(--header-ink-on-light, #2a3346)';
export const HEADER_INK_ON_DARK = 'var(--header-ink-on-dark, #ffffff)';

/**
 * WCAG 1.4.11 (non-text contrast) minimum for UI icons. Light ink is
 * preferred whenever it meets this bar, so headers that historically used
 * white icons and already pass (e.g. home blue) keep their look; only
 * genuinely failing accents (option yellow, question blue, group purple)
 * flip to the dark ink.
 */
const MIN_ICON_CONTRAST = 3;

/** Matches `var(--name)` / `var(--name, fallback)`. */
const CSS_VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+?)\s*)?\)$/i;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const RGB_COLOR_PATTERN =
	/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*[\d.%]+)?\s*\)$/i;

/**
 * Resolves a CSS color expression to a literal color string.
 * `var(--token, fallback)` is resolved against :root's computed style; if the
 * custom property is not defined (e.g. jsdom, detached contexts) the inline
 * fallback is used instead. Literal values pass through unchanged.
 */
export function resolveCssColor(value: string): string | null {
	const trimmed = value.trim();
	const varMatch = CSS_VAR_PATTERN.exec(trimmed);
	if (!varMatch) return trimmed;

	const [, tokenName, fallback] = varMatch;

	if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
		const resolved = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
		if (resolved) return resolveCssColor(resolved);
	}

	return fallback ? resolveCssColor(fallback) : null;
}

/** Parses #rgb/#rgba/#rrggbb/#rrggbbaa and rgb()/rgba() strings. */
export function parseColorToRgb(value: string): Rgb | null {
	const trimmed = value.trim();

	if (HEX_COLOR_PATTERN.test(trimmed)) {
		const hex = trimmed.slice(1);
		const isShort = hex.length <= 4;
		const step = isShort ? 1 : 2;
		const read = (offset: number): number => {
			const raw = hex.slice(offset * step, offset * step + step);

			return parseInt(isShort ? raw + raw : raw, 16);
		};

		return { r: read(0), g: read(1), b: read(2) };
	}

	const rgbMatch = RGB_COLOR_PATTERN.exec(trimmed);
	if (rgbMatch) {
		const [, r, g, b] = rgbMatch;

		return { r: Number(r), g: Number(g), b: Number(b) };
	}

	return null;
}

/** WCAG 2.x relative luminance of an sRGB color. */
export function relativeLuminance({ r, g, b }: Rgb): number {
	const linear = (channel: number): number => {
		const c = channel / 255;

		return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};

	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two luminances (order-independent). */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
	const lighter = Math.max(luminanceA, luminanceB);
	const darker = Math.min(luminanceA, luminanceB);

	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks the header ink (icon/text color) that stays legible on the given
 * header background. Prefers the light ink when it meets WCAG's 3:1 non-text
 * bar (preserves the classic white-icon look wherever it already passes);
 * otherwise returns whichever ink contrasts more. Unresolvable backgrounds
 * keep the legacy light ink so behavior never regresses.
 */
export function getHeaderContrastInk(background: string): string {
	const resolved = resolveCssColor(background);
	const backgroundRgb = resolved ? parseColorToRgb(resolved) : null;
	if (!backgroundRgb) return HEADER_INK_ON_DARK;

	const backgroundLuminance = relativeLuminance(backgroundRgb);

	const lightInkRgb = parseColorToRgb(resolveCssColor(HEADER_INK_ON_DARK) ?? '#ffffff');
	const darkInkRgb = parseColorToRgb(resolveCssColor(HEADER_INK_ON_LIGHT) ?? '#2a3346');
	if (!lightInkRgb || !darkInkRgb) return HEADER_INK_ON_DARK;

	const lightInkContrast = contrastRatio(backgroundLuminance, relativeLuminance(lightInkRgb));
	if (lightInkContrast >= MIN_ICON_CONTRAST) return HEADER_INK_ON_DARK;

	const darkInkContrast = contrastRatio(backgroundLuminance, relativeLuminance(darkInkRgb));

	return darkInkContrast > lightInkContrast ? HEADER_INK_ON_LIGHT : HEADER_INK_ON_DARK;
}
