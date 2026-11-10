import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Parses the token file and holds every text pair to WCAG AA in all four variants. */

type Tokens = Record<string, string>;

const AA_TEXT = 4.5;
const source = readFileSync(resolve(__dirname, '../_tokens.scss'), 'utf8');

function block(selector: string): Tokens {
	const start = source.indexOf(`${selector} {`);
	const end = source.indexOf('\n}', start);
	const tokens: Tokens = {};

	for (const [, name, value] of source.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
		tokens[name] = value;
	}

	return tokens;
}

const ROOT = block(':root');
const DARK = block("[data-theme='dark']");
const CONTRAST = block("[data-contrast='high']");
const DARK_CONTRAST = block("[data-theme='dark'][data-contrast='high']");

const VARIANTS: ReadonlyArray<[string, Tokens]> = [
	['light', ROOT],
	['dark', { ...ROOT, ...DARK }],
	['high contrast', { ...ROOT, ...CONTRAST }],
	['dark high contrast', { ...ROOT, ...DARK, ...CONTRAST, ...DARK_CONTRAST }],
];

const PAIRS: ReadonlyArray<[string, string]> = [
	['--ink', '--paper'],
	['--ink', '--card'],
	['--ink', '--paper-soft'],
	['--ink', '--brand-soft'],
	['--ink-muted', '--paper'],
	['--ink-muted', '--card'],
	['--brand', '--paper'],
	['--brand', '--card'],
	['--brand', '--brand-soft'],
	['--brand-ink', '--brand'],
	['--brand-strong', '--brand-soft'],
	['--danger', '--card'],
	['--danger', '--danger-soft'],
	['--success-ink', '--success'],
	['--success-strong', '--success-soft'],
	['--warning', '--warning-soft'],
	['--disabled-ink', '--disabled-bg'],
	['--side-a', '--card'],
	['--side-b', '--card'],
];

function channel(hex: string, from: number): number {
	const value = parseInt(hex.slice(from, from + 2), 16) / 255;

	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

	return (light + 0.05) / (dark + 0.05);
}

describe.each(VARIANTS)('%s tokens', (_name, tokens) => {
	it.each(PAIRS)('%s on %s reaches AA', (text, background) => {
		expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(AA_TEXT);
	});
});

describe('colour values', () => {
	it('live only in the token file', () => {
		const files = [
			'_base',
			'_forms',
			'_a11y',
			'_modal',
			'_steps',
			'_rank-list',
			'_position-stops',
			'_my-table',
			'_participant',
			'_host',
			'_side-slider',
		];

		for (const file of files) {
			const text = readFileSync(resolve(__dirname, `../${file}.scss`), 'utf8');

			expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
		}
	});
});
