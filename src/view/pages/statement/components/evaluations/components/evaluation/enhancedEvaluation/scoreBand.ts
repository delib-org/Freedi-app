/**
 * Reading a consensus score (-1…1) as words and a colour, for the consensus
 * bar on an answer card. Thresholds are the design handoff's scoreLabel() and
 * scoreColor().
 */

export type ScoreBand = 'broad' | 'partial' | 'divided' | 'opposition';
export type ScoreTone = 'positive' | 'split' | 'negative';

/** At or above: broad agreement. */
export const BROAD_AGREEMENT_MIN = 0.6;
/** At or above: partial agreement, and the positive colour. */
export const PARTIAL_AGREEMENT_MIN = 0.3;
/** Strictly above: divided (split colour); at or below: opposition. */
export const DIVIDED_ABOVE = -0.1;

const PERCENT = 100;

export const SCORE_BAND_LABEL_KEYS: Record<ScoreBand, string> = {
	broad: 'Broad agreement',
	partial: 'Partial agreement',
	// Not the existing "Divided" key: its Hebrew (מחולקים) describes people, not the score.
	divided: 'Divided opinion',
	opposition: 'Opposition',
};

export function getScoreBand(score: number): ScoreBand {
	if (score >= BROAD_AGREEMENT_MIN) return 'broad';
	if (score >= PARTIAL_AGREEMENT_MIN) return 'partial';
	if (score > DIVIDED_ABOVE) return 'divided';

	return 'opposition';
}

export function getScoreTone(score: number): ScoreTone {
	if (score >= PARTIAL_AGREEMENT_MIN) return 'positive';
	if (score > DIVIDED_ABOVE) return 'split';

	return 'negative';
}

/** Bar fill: -1 → 0%, 0 → 50%, 1 → 100%, clamped. */
export function getConsensusBarPercent(score: number): number {
	const pct = Math.round(((score + 1) / 2) * PERCENT);

	return Math.min(PERCENT, Math.max(0, pct));
}
