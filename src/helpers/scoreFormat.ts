/**
 * How a −1…1 score is shown to people: a whole number from −100 to +100 with a
 * sign and no "%", because it is not a share of people. Bands and thresholds
 * read the same whole number, so "+60" can never sit beside a label meant for
 * scores under 60.
 */

const SCORE_SCALE = 100;
const MINUS_SIGN = '−';

/** A −1…1 score as a whole number from −100 to 100. Rounds away from zero, never −0. */
export function toDisplayScore(score: number): number {
	if (!Number.isFinite(score)) return 0;
	const clamped = Math.max(-1, Math.min(1, score));
	const rounded = Math.round(Math.abs(clamped) * SCORE_SCALE);
	if (rounded === 0) return 0;

	return clamped < 0 ? -rounded : rounded;
}

/** "+62", "−15", "0". Render inside `dir="ltr"` so the sign stays before the digits in RTL. */
export function formatScore(score: number): string {
	const display = toDisplayScore(score);
	if (display > 0) return `+${display}`;
	if (display < 0) return `${MINUS_SIGN}${-display}`;

	return '0';
}

/** A threshold on the score's scale, for a sentence: "60", "−10", no plus sign. */
export function formatScoreThreshold(score: number): string {
	const display = toDisplayScore(score);

	return display < 0 ? `${MINUS_SIGN}${-display}` : String(display);
}
