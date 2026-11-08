import { TIME } from '@/constants/common';

const YEAR_MS = 12 * TIME.MONTH;

const UNITS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number; below: number }> = [
	{ unit: 'minute', ms: TIME.MINUTE, below: TIME.HOUR },
	{ unit: 'hour', ms: TIME.HOUR, below: TIME.DAY },
	{ unit: 'day', ms: TIME.DAY, below: TIME.MONTH },
	{ unit: 'month', ms: TIME.MONTH, below: YEAR_MS },
	{ unit: 'year', ms: YEAR_MS, below: Number.POSITIVE_INFINITY },
];

/**
 * "2 hours ago" / "yesterday" / "לפני שעתיים" in the reader's language, from
 * Intl so every locale gets correct grammar without a translation key.
 * Anything under a minute reads as one minute ago.
 */
export function formatRelativeTime(timestamp: number, now: number, locale: string): string {
	const elapsed = Math.max(0, now - timestamp);
	const { unit, ms } = UNITS.find(({ below }) => elapsed < below) ?? UNITS[UNITS.length - 1];
	const amount = Math.max(1, Math.floor(elapsed / ms));

	return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-amount, unit);
}
