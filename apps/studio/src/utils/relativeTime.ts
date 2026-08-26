const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * "3 minutes ago" / "לפני 3 דקות" — locale-aware via Intl, so no i18n keys are
 * needed for the units. `locale` is the active shared-i18n language code.
 */
export function formatRelativeTime(timestampMs: number, locale: string, now = Date.now()): string {
	const diff = timestampMs - now;
	const abs = Math.abs(diff);
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

	if (abs < MINUTE) return formatter.format(Math.round(diff / SECOND), 'second');
	if (abs < HOUR) return formatter.format(Math.round(diff / MINUTE), 'minute');
	if (abs < DAY) return formatter.format(Math.round(diff / HOUR), 'hour');
	if (abs < WEEK) return formatter.format(Math.round(diff / DAY), 'day');
	if (abs < MONTH) return formatter.format(Math.round(diff / WEEK), 'week');

	return formatter.format(Math.round(diff / MONTH), 'month');
}

/** Milliseconds in a day — the nudge-cooldown window shown to facilitators. */
export const DAY_MS = DAY;
