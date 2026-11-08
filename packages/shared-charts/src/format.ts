import type { Granularity } from './types';

const DEFAULT_LOCALE = 'en';

export function formatNumber(value: number, locale = DEFAULT_LOCALE, maxFractionDigits = 1): string {
	if (!Number.isFinite(value)) return '–';

	return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** Parse a `YYYY-MM-DD` or `YYYY-MM` key as a UTC date; `null` when malformed. */
export function parseBucketKey(key: string): Date | null {
	const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(key);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = m[3] === undefined ? 1 : Number(m[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Human label for an axis bucket:
 *  - day  → short day/month in the locale's separator, day first ("22/9", "22.9")
 *  - week → the same, for the week's first day (the key IS the week start)
 *  - month → short month name + 2-digit year ("Sep 26")
 * Unparseable keys are returned as they are, so a chart never throws on data.
 */
export function formatBucketKey(key: string, granularity: Granularity, locale = DEFAULT_LOCALE): string {
	const date = parseBucketKey(key);
	if (!date) return key;
	if (granularity === 'month') {
		return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
	}

	return formatDayMonth(date, locale);
}

function formatDayMonth(date: Date, locale: string): string {
	const parts = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'numeric',
		timeZone: 'UTC',
	}).formatToParts(date);
	const day = parts.find((p) => p.type === 'day')?.value ?? String(date.getUTCDate());
	const month = parts.find((p) => p.type === 'month')?.value ?? String(date.getUTCMonth() + 1);
	const literal = parts.find((p) => p.type === 'literal')?.value.trim() || '/';

	return `${day}${literal}${month}`;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Split a duration into whole hours and rounded minutes (60 min rolls over). */
export function formatMinutes(ms: number): { h: number; m: number } {
	const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
	const totalMinutes = Math.round(safe / MS_PER_MINUTE);

	return {
		h: Math.floor(totalMinutes / MINUTES_PER_HOUR),
		m: totalMinutes % MINUTES_PER_HOUR,
	};
}

/** `YYYY-MM-DD` (UTC) for a millisecond timestamp. */
export function dayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}
