import type { TableAssignmentEvent } from '@freedi/shared-types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** BCP 47 locale per UI language. Arabic is pinned to Latin digits so it matches the HH:MM time. */
const DATE_LOCALES: Record<string, string> = { he: 'he-IL', en: 'en-GB', ar: 'ar-u-nu-latn' };
const DATE_FALLBACK_LOCALE = 'en-GB';

/** 'YYYY-MM-DD' as {year, month, day}, or null when it is not a real calendar day. */
function splitDate(date: string): { year: number; month: number; day: number } | null {
	const [year, month, day] = date.split('-').map(Number);
	const asDate = new Date(Date.UTC(year, month - 1, day));
	const real =
		asDate.getUTCFullYear() === year &&
		asDate.getUTCMonth() === month - 1 &&
		asDate.getUTCDate() === day;

	return real ? { year, month, day } : null;
}

/**
 * The date in the reader's language, e.g. "19 במרץ" / "19 March". The year is added only when it
 * is not the current one. The day is read as a plain calendar day (UTC), so no time zone moves it.
 */
export function formatEventDate(date: string, lang: string, now: Date = new Date()): string | null {
	const parts = splitDate(date);

	if (!parts) return null;
	const showYear = parts.year !== now.getUTCFullYear();
	const formatter = new Intl.DateTimeFormat(DATE_LOCALES[lang] ?? DATE_FALLBACK_LOCALE, {
		day: 'numeric',
		month: 'long',
		year: showYear ? 'numeric' : undefined,
		timeZone: 'UTC',
	});

	return formatter.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

/**
 * The one sentence participants read: "We will see you on the 19th of March, 17:00 at the community
 * club". Built from whichever parts the host filled in (a sentence per combination, so each language
 * reads naturally); null when there is nothing to say.
 */
export function eventLine(
	event: TableAssignmentEvent | undefined,
	lang: string,
	translate: Translate,
	now: Date = new Date(),
): string | null {
	if (!event) return null;
	const date = event.date ? formatEventDate(event.date, lang, now) : null;
	const time = event.time ?? null;
	const place = event.place?.trim() || null;
	const shape = `${date ? 'd' : ''}${time ? 't' : ''}${place ? 'p' : ''}`;

	if (shape === '') return null;

	return translate(`tableAssignment.event.line.${shape}`, {
		date: date ?? '',
		time: time ?? '',
		place: place ?? '',
	});
}
