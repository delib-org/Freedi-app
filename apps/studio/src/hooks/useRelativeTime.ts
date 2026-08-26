import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * Relative "2 hours ago" formatting via Intl.RelativeTimeFormat, plus a hook
 * that re-renders every minute so the label stays fresh.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Below this, the label is "just now" instead of "N seconds ago". */
const JUST_NOW_THRESHOLD = 45 * SECOND;
/** Re-render cadence for the hook. */
export const RELATIVE_TIME_TICK_MS = MINUTE;

export interface FormatRelativeTimeOptions {
	/** Reference time (defaults to Date.now()). */
	now?: number;
	/** Translated "just now" label; falls back to Intl's "now". */
	justNow?: string;
}

function formatAbsolute(ms: number, locale: string, now: number): string {
	const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
	try {
		return new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'short',
			year: sameYear ? undefined : 'numeric',
		}).format(ms);
	} catch {
		return new Date(ms).toLocaleDateString();
	}
}

/**
 * seconds → "just now"; minutes / hours / days → "N minutes ago" (localised,
 * with "yesterday"/"tomorrow" where the locale has them); > 7 days → a
 * localised short date.
 */
export function formatRelativeTime(
	ms: number,
	locale: string,
	options: FormatRelativeTimeOptions = {},
): string {
	const now = options.now ?? Date.now();
	if (!Number.isFinite(ms)) return '';

	const diff = ms - now;
	const abs = Math.abs(diff);

	if (abs >= WEEK) return formatAbsolute(ms, locale, now);

	let rtf: Intl.RelativeTimeFormat | null = null;
	try {
		rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	} catch {
		rtf = null;
	}

	if (abs < JUST_NOW_THRESHOLD) {
		return options.justNow ?? (rtf ? rtf.format(0, 'second') : 'now');
	}

	if (!rtf) return formatAbsolute(ms, locale, now);

	if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
	if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');

	return rtf.format(Math.round(diff / DAY), 'day');
}

/** Ticks every `intervalMs` so relative labels re-render. Returns the current time. */
export function useNowTick(intervalMs: number = RELATIVE_TIME_TICK_MS): number {
	const [now, setNow] = useState<number>(() => Date.now());

	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), intervalMs);

		return () => window.clearInterval(id);
	}, [intervalMs]);

	return now;
}

/**
 * "2 hours ago" for a millisecond timestamp, in the active UI language,
 * refreshed every minute. Returns '' when the timestamp is missing.
 */
export function useRelativeTime(ms: number | undefined | null): string {
	const { t, currentLanguage } = useTranslation();
	const now = useNowTick();

	if (ms === undefined || ms === null) return '';

	return formatRelativeTime(ms, currentLanguage, { now, justNow: t('just now') });
}
