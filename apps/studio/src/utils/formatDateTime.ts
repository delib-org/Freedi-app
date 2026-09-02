/**
 * Absolute date-time formatting for scheduled actions, plus the conversions
 * an `<input type="datetime-local">` needs. Locale-aware via Intl; every
 * formatter has a plain fallback so a bad locale tag never throws.
 */
const DATETIME_LOCAL_LENGTH = 'YYYY-MM-DDTHH:mm'.length;

/** "26 Aug 2026, 09:30" in the active UI language. */
export function formatDateTime(ms: number, locale: string): string {
	if (!Number.isFinite(ms)) return '';
	try {
		return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
	} catch {
		return new Date(ms).toLocaleString();
	}
}

/** ISO-8601 for `<time dateTime>`; '' when the value is not a valid time. */
export function toIsoDateTime(ms: number): string {
	if (!Number.isFinite(ms)) return '';
	try {
		return new Date(ms).toISOString();
	} catch {
		return '';
	}
}

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** Epoch ms → the local-time `YYYY-MM-DDTHH:mm` a datetime-local input shows. */
export function toDateTimeLocalValue(ms: number): string {
	if (!Number.isFinite(ms)) return '';
	const d = new Date(ms);

	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` (local time) → epoch ms; null when unparsable. */
export function fromDateTimeLocalValue(value: string): number | null {
	if (!value || value.length < DATETIME_LOCAL_LENGTH) return null;
	const ms = new Date(value).getTime();

	return Number.isFinite(ms) ? ms : null;
}
