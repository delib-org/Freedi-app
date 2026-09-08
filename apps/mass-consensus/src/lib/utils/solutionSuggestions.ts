/**
 * Helpers for the "write the first solutions for me" button in the
 * create-question wizard. A model asked for a list happily returns numbered
 * lines, near-duplicates and the occasional essay, so everything it writes is
 * normalised here before it reaches the admin's textarea.
 */

/** How many starting solutions the button asks for. */
export const SUGGESTED_SOLUTIONS_COUNT = 6;

/** Longest a single suggested solution may be once cleaned. */
export const SUGGESTED_SOLUTION_MAX_CHARS = 240;

/** Shortest text still worth showing as a solution. */
const MIN_SOLUTION_CHARS = 3;

/** Leading list decoration the model adds unasked: "1. ", "- ", "• ", "*". */
const LIST_PREFIX = /^\s*(?:[-*•–—]|\d+[.)])\s+/;

const normalizeKey = (text: string): string => text.toLowerCase().replace(/[\s.,;:!?"'`]+/g, ' ').trim();

/**
 * Trims, de-decorates and de-duplicates generated solutions.
 *
 * @param raw - Lines as the model returned them.
 * @param count - Most solutions to keep.
 * @param existing - Solutions already in the textarea; matches are dropped.
 */
export function cleanSuggestedSolutions(
	raw: readonly unknown[] | undefined,
	count: number = SUGGESTED_SOLUTIONS_COUNT,
	existing: readonly string[] = []
): string[] {
	const seen = new Set<string>(existing.map(normalizeKey).filter((key) => key.length > 0));
	const cleaned: string[] = [];

	for (const item of raw ?? []) {
		if (typeof item !== 'string') continue;

		const text = item
			.replace(LIST_PREFIX, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, SUGGESTED_SOLUTION_MAX_CHARS)
			.trim();
		const key = normalizeKey(text);

		if (text.length < MIN_SOLUTION_CHARS || key.length === 0 || seen.has(key)) continue;

		seen.add(key);
		cleaned.push(text);

		if (cleaned.length >= count) break;
	}

	return cleaned;
}

/**
 * Appends generated solutions to whatever the admin already typed, keeping the
 * textarea's one-solution-per-line shape and never leaving a blank line behind.
 */
export function appendSolutionLines(currentText: string, additions: readonly string[]): string {
	if (additions.length === 0) return currentText;

	const kept = currentText
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	return [...kept, ...additions].join('\n');
}
