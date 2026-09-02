import { describe, it, expect } from 'vitest';
import {
	formatDateTime,
	fromDateTimeLocalValue,
	toDateTimeLocalValue,
	toIsoDateTime,
} from '../formatDateTime';

describe('formatDateTime', () => {
	const ms = Date.UTC(2026, 7, 26, 9, 30);

	it('formats a localized medium date + short time and never throws on a bad locale', () => {
		expect(formatDateTime(ms, 'en')).toMatch(/2026/);
		expect(formatDateTime(ms, 'he')).toMatch(/2026/);
		expect(formatDateTime(ms, 'not-a-locale-!!')).toMatch(/2026/);
	});

	it('returns an empty string for a non-finite value', () => {
		expect(formatDateTime(Number.NaN, 'en')).toBe('');
		expect(toIsoDateTime(Number.NaN)).toBe('');
	});

	it('produces ISO-8601 for <time dateTime>', () => {
		expect(toIsoDateTime(ms)).toBe('2026-08-26T09:30:00.000Z');
	});

	it('round-trips through the datetime-local value in local time', () => {
		const local = new Date(2026, 7, 26, 9, 5).getTime();
		const value = toDateTimeLocalValue(local);
		expect(value).toBe('2026-08-26T09:05');
		expect(fromDateTimeLocalValue(value)).toBe(local);
	});

	it('rejects unparsable datetime-local input', () => {
		expect(fromDateTimeLocalValue('')).toBeNull();
		expect(fromDateTimeLocalValue('2026-08')).toBeNull();
		expect(fromDateTimeLocalValue('nonsense-value-xx')).toBeNull();
		expect(toDateTimeLocalValue(Number.NaN)).toBe('');
	});
});
