export type PlaceholderValues = Readonly<Record<string, string | number>>;

/**
 * Fills `{{name}}`-style placeholders in an already translated string.
 * `t()` takes one argument, so interpolation happens after translation.
 * A placeholder with no value is left as written, so a missing value shows
 * up in review instead of silently disappearing.
 */
export function fillPlaceholders(template: string, values: PlaceholderValues): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) =>
		name in values ? String(values[name]) : match,
	);
}
