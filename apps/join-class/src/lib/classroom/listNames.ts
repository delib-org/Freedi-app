/**
 * "Noa, Omri or Lior" in the given language: the locale's own list words
 * ("או", "oder", "o"), so no string table needs a joiner. Falls back to commas
 * on a browser without Intl.ListFormat.
 */
export function joinNames(names: readonly string[], lang: string): string {
	if (typeof Intl.ListFormat !== 'function') return names.join(', ');

	return new Intl.ListFormat(lang, { style: 'long', type: 'disjunction' }).format(names);
}

/**
 * "Noa and Avi" in the given language: the locale's own "and" ("ו", "und", "y"),
 * for the lines that name who the table waits for. Falls back to commas on a
 * browser without Intl.ListFormat.
 */
export function joinAll(names: readonly string[], lang: string): string {
	if (typeof Intl.ListFormat !== 'function') return names.join(', ');

	return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(names);
}
