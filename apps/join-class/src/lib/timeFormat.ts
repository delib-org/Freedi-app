import { t } from './i18n';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Render a "time remaining" duration as a compact, translatable string:
 *   ms ≥ 1d   → "5d 3h"     (days + hours)
 *   ms ≥ 1h   → "12h 14m"  (hours + minutes)
 *   ms ≥ 1m   → "13m"
 *   ms < 1m   → "<1m"
 *   ms ≤ 0    → returns null so callers can decide what to show.
 *
 * The number tokens come from `common.time.{days,hours,minutes,lessThanMin}`
 * so RTL languages get the unit on the correct side.
 */
export function formatRemaining(ms: number): string | null {
	if (ms <= 0) return null;
	if (ms < MINUTE) return t('common.time.lessThanMin');

	if (ms >= DAY) {
		const days = Math.floor(ms / DAY);
		const hours = Math.floor((ms - days * DAY) / HOUR);
		const dayPart = t('common.time.days', { count: days });
		if (hours > 0) {
			return `${dayPart} ${t('common.time.hours', { count: hours })}`;
		}

		return dayPart;
	}

	if (ms >= HOUR) {
		const hours = Math.floor(ms / HOUR);
		const minutes = Math.floor((ms - hours * HOUR) / MINUTE);
		const hourPart = t('common.time.hours', { count: hours });
		if (minutes > 0) {
			return `${hourPart} ${t('common.time.minutes', { count: minutes })}`;
		}

		return hourPart;
	}

	const minutes = Math.floor(ms / MINUTE);

	return t('common.time.minutes', { count: minutes });
}
