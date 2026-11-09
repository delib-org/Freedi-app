/**
 * System bar colours (PWA status bar).
 *
 * Pure colour helpers. The DOM side lives in systemBarSync.ts.
 */

export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const HEX_CHANNEL_LENGTH = 2;
const HEX_SHORT_LENGTH = 3;
const HEX_FULL_LENGTH = 6;
export const OPAQUE_THRESHOLD = 0.99;
const RGB_PATTERN = /^rgba?\(\s*(.+?)\s*\)$/i;
const SRGB_PATTERN = /^color\(\s*srgb\s+(.+?)\s*\)$/i;

function clampChannel(value: number): number {
	return Math.min(MAX_CHANNEL, Math.max(0, Math.round(value)));
}

function parseHex(value: string): Rgba | null {
	const digits = value.slice(1);
	const expanded =
		digits.length === HEX_SHORT_LENGTH
			? digits
					.split('')
					.map((char) => char + char)
					.join('')
			: digits;

	if (expanded.length !== HEX_FULL_LENGTH || !/^[0-9a-f]+$/i.test(expanded)) return null;

	const [r, g, b] = [0, 1, 2].map((index) =>
		parseInt(
			expanded.slice(index * HEX_CHANNEL_LENGTH, (index + 1) * HEX_CHANNEL_LENGTH),
			HEX_RADIX,
		),
	);

	return { r, g, b, a: 1 };
}

function parseAlpha(raw: string | undefined): number {
	if (raw === undefined || raw === '') return 1;

	return raw.endsWith('%') ? parseFloat(raw) / 100 : Number(raw);
}

/**
 * Parses what getComputedStyle returns for a background colour: `rgb()` /
 * `rgba()` (comma or space syntax) and `color(srgb ...)`, plus plain hex.
 * Returns null for anything else (named, oklch, ...), which callers treat as
 * "not usable".
 */
export function parseCssColor(value: string | null | undefined): Rgba | null {
	if (!value) return null;

	const trimmed = value.trim();

	if (trimmed.startsWith('#')) return parseHex(trimmed);

	const srgbMatch = SRGB_PATTERN.exec(trimmed);
	const match = srgbMatch ?? RGB_PATTERN.exec(trimmed);

	if (!match) return null;

	const scale = srgbMatch ? MAX_CHANNEL : 1;
	const [colorPart, slashAlpha] = match[1].split('/').map((part) => part.trim());
	const tokens = colorPart.split(/[\s,]+/).filter(Boolean);
	const channels = tokens.slice(0, 3).map(Number);

	if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) return null;

	const alpha = parseAlpha(slashAlpha ?? tokens[3]);

	if (Number.isNaN(alpha)) return null;

	return {
		r: clampChannel(channels[0] * scale),
		g: clampChannel(channels[1] * scale),
		b: clampChannel(channels[2] * scale),
		a: alpha,
	};
}

export function rgbaToHex({ r, g, b }: Rgba): string {
	const hex = [r, g, b].map((channel) =>
		channel.toString(HEX_RADIX).padStart(HEX_CHANNEL_LENGTH, '0'),
	);

	return `#${hex.join('')}`;
}
