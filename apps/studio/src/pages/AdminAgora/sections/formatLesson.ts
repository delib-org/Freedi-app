import { formatMinutes } from '@freedi/shared-charts';

/** "1 h 20 min" / "45 min" through the app's translator. */
export function lessonDuration(
	ms: number,
	tWithParams: (text: string, params: Record<string, string | number>) => string,
): string {
	const { h, m } = formatMinutes(ms);

	return h > 0 ? tWithParams('{{h}} h {{m}} min', { h, m }) : tWithParams('{{m}} min', { m });
}

/** A short date in the current language, or `fallback` for 0 / missing. */
export function shortDate(ms: number | undefined, locale: string, fallback: string): string {
	if (!ms) return fallback;

	return new Date(ms).toLocaleDateString(locale);
}
