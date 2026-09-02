/**
 * Timezone-aware date helpers with no dependencies (Intl only).
 * Used to turn "day 14 at 09:00 in the admin's timezone" into epoch ms and an
 * ISO-8601 string with offset.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface IsoDateParts {
	year: number;
	month: number;
	day: number;
}

export function parseIsoDate(dateIso: string): IsoDateParts | undefined {
	const match = ISO_DATE.exec(dateIso);
	if (!match) return undefined;

	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

export function formatIsoDate(parts: IsoDateParts): string {
	return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Adds calendar days to a 'YYYY-MM-DD' string (pure date arithmetic). */
export function addDays(dateIso: string, days: number): string {
	const parts = parseIsoDate(dateIso);
	if (!parts) return dateIso;
	const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS);

	return formatIsoDate({
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
	});
}

/** Offset (minutes east of UTC) of `timezone` at instant `ms`. Falls back to 0. */
export function timezoneOffsetMinutes(ms: number, timezone: string): number {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		const parts = formatter.formatToParts(new Date(ms));
		const get = (type: Intl.DateTimeFormatPartTypes): number =>
			Number(parts.find((part) => part.type === type)?.value ?? '0');
		const asUtc = Date.UTC(
			get('year'),
			get('month') - 1,
			get('day'),
			get('hour') % 24,
			get('minute'),
			get('second'),
		);

		return Math.round((asUtc - ms) / MINUTE_MS);
	} catch {
		return 0;
	}
}

/** Epoch ms of `dateIso` at `hour:minute` local time in `timezone`. */
export function localDateTimeToMs(
	dateIso: string,
	hour: number,
	minute: number,
	timezone: string,
): number {
	const parts = parseIsoDate(dateIso);
	if (!parts) return Number.NaN;
	const guess = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
	const firstOffset = timezoneOffsetMinutes(guess, timezone);
	let ms = guess - firstOffset * MINUTE_MS;
	const secondOffset = timezoneOffsetMinutes(ms, timezone);
	if (secondOffset !== firstOffset) ms = guess - secondOffset * MINUTE_MS;

	return ms;
}

/** ISO-8601 with numeric offset, e.g. '2026-09-09T09:00:00+03:00'. */
export function toOffsetIso(ms: number, timezone: string): string {
	const offset = timezoneOffsetMinutes(ms, timezone);
	const local = new Date(ms + offset * MINUTE_MS);
	const sign = offset < 0 ? '-' : '+';
	const abs = Math.abs(offset);
	const date = formatIsoDate({
		year: local.getUTCFullYear(),
		month: local.getUTCMonth() + 1,
		day: local.getUTCDate(),
	});
	const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;

	return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Today's 'YYYY-MM-DD' in `timezone` for the instant `ms`. */
export function isoDateInTimezone(ms: number, timezone: string): string {
	return toOffsetIso(ms, timezone).slice(0, 10);
}
