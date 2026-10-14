/**
 * Is a participant's suggestion real text, or keyboard noise?
 *
 * "ייי" and "ככע" passed the 3-character minimum and were merged into an
 * admin's option. A suggestion needs at least two real words: a word has
 * two or more letters or digits, and not just one character repeated.
 */
export const MIN_MEANINGFUL_WORDS = 2;

function isRealWord(token: string): boolean {
	const chars = token.match(/[\p{L}\p{N}]/gu) ?? [];
	if (chars.length < 2) return false;

	return new Set(chars.map((c) => c.toLowerCase())).size >= 2;
}

export function countMeaningfulWords(text: string): number {
	return text.trim().split(/\s+/u).filter(isRealWord).length;
}

export function isMeaningfulSuggestion(text: string): boolean {
	return countMeaningfulWords(text) >= MIN_MEANINGFUL_WORDS;
}
