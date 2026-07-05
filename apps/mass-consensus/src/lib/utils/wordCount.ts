/**
 * Word-count utilities for the optional per-question minimum-word requirement
 * (see StatementSettings.minResponseWords). A minimum of undefined or <= 0
 * means "no minimum" — nothing is enforced.
 */

/**
 * Count the words in a free-text response. Splits on any Unicode whitespace and
 * ignores empty tokens, so leading/trailing/duplicated spaces do not inflate the
 * count. Works for space-delimited scripts (Latin, Hebrew, Arabic, etc.).
 */
export function countWords(text: string): number {
  if (!text) return 0;

  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Whether a response satisfies the (optional) minimum-word requirement.
 * Returns true when no minimum is configured (undefined / <= 0).
 */
export function meetsWordMinimum(
  text: string,
  minWords: number | undefined,
): boolean {
  if (!minWords || minWords <= 0) return true;

  return countWords(text) >= minWords;
}
