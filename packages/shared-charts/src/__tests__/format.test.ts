import { dayKey, formatBucketKey, formatMinutes, formatNumber, parseBucketKey } from '../format';

describe('formatNumber', () => {
	it('formats with at most one decimal in the locale', () => {
		expect(formatNumber(1234.56, 'en')).toBe('1,234.6');
		expect(formatNumber(12, 'en')).toBe('12');
		expect(formatNumber(1234.5, 'he')).toContain('1');
		expect(formatNumber(7.25, 'en', 0)).toBe('7');
	});

	it('prints a dash for non-finite values', () => {
		expect(formatNumber(Number.NaN)).toBe('–');
		expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('–');
	});
});

describe('parseBucketKey', () => {
	it('parses day and month keys as UTC', () => {
		expect(parseBucketKey('2026-09-22')?.toISOString()).toBe('2026-09-22T00:00:00.000Z');
		expect(parseBucketKey('2026-09')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
	});

	it('rejects malformed keys', () => {
		expect(parseBucketKey('yesterday')).toBeNull();
		expect(parseBucketKey('2026-13-01')).toBeNull();
		expect(parseBucketKey('2026-09-40')).toBeNull();
	});
});

describe('formatBucketKey', () => {
	it('formats a day as day/month, day first, in en and he', () => {
		expect(formatBucketKey('2026-09-22', 'day', 'en')).toBe('22/9');
		expect(formatBucketKey('2026-09-22', 'day', 'he')).toBe('22.9');
	});

	it('formats a week by its first day', () => {
		expect(formatBucketKey('2026-09-20', 'week', 'en')).toBe('20/9');
		expect(formatBucketKey('2026-09-20', 'week', 'he')).toBe('20.9');
	});

	it('formats a month as short month + 2-digit year', () => {
		expect(formatBucketKey('2026-09', 'month', 'en')).toBe('Sep 26');
		expect(formatBucketKey('2026-09', 'month', 'he')).toContain('26');
	});

	it('passes unparseable keys through', () => {
		expect(formatBucketKey('Q3', 'month', 'en')).toBe('Q3');
	});
});

describe('formatMinutes', () => {
	it('splits milliseconds into hours and minutes', () => {
		expect(formatMinutes(90 * 60_000)).toEqual({ h: 1, m: 30 });
		expect(formatMinutes(5 * 60_000)).toEqual({ h: 0, m: 5 });
	});

	it('rolls 60 minutes into the next hour', () => {
		expect(formatMinutes(59.6 * 60_000)).toEqual({ h: 1, m: 0 });
	});

	it('treats nonsense as zero', () => {
		expect(formatMinutes(-5)).toEqual({ h: 0, m: 0 });
		expect(formatMinutes(Number.NaN)).toEqual({ h: 0, m: 0 });
	});
});

describe('dayKey', () => {
	it('gives the UTC calendar day', () => {
		expect(dayKey(Date.UTC(2026, 8, 22, 23, 59))).toBe('2026-09-22');
	});
});
