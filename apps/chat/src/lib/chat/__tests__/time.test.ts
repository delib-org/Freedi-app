import { describe, expect, it } from 'vitest';
import { timeAgo } from '../time';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
	it('returns empty string for missing or invalid timestamps', () => {
		expect(timeAgo(undefined, NOW)).toBe('');
		expect(timeAgo(null, NOW)).toBe('');
		expect(timeAgo(0, NOW)).toBe('');
		expect(timeAgo(-5, NOW)).toBe('');
	});

	it('returns "now" under a minute', () => {
		expect(timeAgo(NOW, NOW)).toBe('now');
		expect(timeAgo(NOW - 59_000, NOW)).toBe('now');
	});

	it('clamps future timestamps to "now"', () => {
		expect(timeAgo(NOW + HOUR, NOW)).toBe('now');
	});

	it('formats minutes', () => {
		expect(timeAgo(NOW - MINUTE, NOW)).toBe('1m');
		expect(timeAgo(NOW - 59 * MINUTE, NOW)).toBe('59m');
	});

	it('formats hours', () => {
		expect(timeAgo(NOW - HOUR, NOW)).toBe('1h');
		expect(timeAgo(NOW - 23 * HOUR, NOW)).toBe('23h');
	});

	it('formats days', () => {
		expect(timeAgo(NOW - DAY, NOW)).toBe('1d');
		expect(timeAgo(NOW - 6 * DAY, NOW)).toBe('6d');
	});

	it('formats weeks', () => {
		expect(timeAgo(NOW - 7 * DAY, NOW)).toBe('1w');
		expect(timeAgo(NOW - 364 * DAY, NOW)).toBe('52w');
	});

	it('formats years', () => {
		expect(timeAgo(NOW - 365 * DAY, NOW)).toBe('1y');
		expect(timeAgo(NOW - 800 * DAY, NOW)).toBe('2y');
	});
});
