/**
 * Reading a question stage's answers by CONSENSUS, not by mean.
 *
 * The cards students rate show net agreement (the plain mean), because that
 * is what a rating feels like from the inside. The record a question leaves
 * behind is a different claim — "the room stands behind this" — and that
 * claim has to survive the question "how many of you actually said so?".
 * So the summary bands the carried answers by C_p = μ − t·SEM*, the shared
 * consensus score (see `utils/consensusCalculation`): an answer two friends
 * loved is penalised into a lower band than one the whole room liked a bit
 * less, which is exactly the lesson the stage is there to teach.
 *
 * The bands are declared here, over a structural row, so the teacher's live
 * preview, the server's close and the AI's prompt all read the same ladder.
 */

import { object, string, number, array, picklist, InferOutput } from 'valibot';

/**
 * Where C_p cuts the ladder. Deliberately low compared to the mean the same
 * answers show: with a classroom's n (5–30 raters) the t·SEM* penalty runs
 * 0.2–0.4, so a genuinely well-liked answer lands near +0.4, not +0.8.
 */
export const AGORA_CP_BANDS = {
	/** C_p at or above this — the room is behind it, and enough of the room said so */
	STRONG_MIN: 0.4,
	/** C_p at or above this — real support that is not yet firm: a mild yes, or too few raters */
	EMERGING_MIN: 0,
} as const;

export const AgoraCpBandSchema = picklist(['strong', 'emerging', 'contested', 'unrated']);

export type AgoraCpBand = InferOutput<typeof AgoraCpBandSchema>;

/** Strongest first — the order every panel prints the bands in */
export const AGORA_CP_BAND_ORDER: readonly AgoraCpBand[] = [
	'strong',
	'emerging',
	'contested',
	'unrated',
];

/** What the band reader needs off an answer; both the client row and the stored one fit */
export interface CpBandRow {
	/** C_p as the evaluation pipeline wrote it onto the statement */
	consensus?: number;
	/** Net agreement, −1…1 — the fallback when C_p has not been written yet */
	mean: number;
	raters: number;
}

/**
 * The C_p an answer is banded by. Falls back to the mean when the pipeline
 * has not stamped `consensus` yet (a rating still in flight, or an outcome
 * stored before this reading existed) — a reading that is too generous by
 * the confidence penalty, but never a silent zero.
 */
export function cpOf(row: CpBandRow): number {
	if (row.raters <= 0) return 0;
	if (typeof row.consensus === 'number' && Number.isFinite(row.consensus)) return row.consensus;

	return Number.isFinite(row.mean) ? row.mean : 0;
}

export function agoraCpBand(row: CpBandRow): AgoraCpBand {
	if (row.raters <= 0) return 'unrated';
	const cp = cpOf(row);
	if (cp >= AGORA_CP_BANDS.STRONG_MIN) return 'strong';
	if (cp >= AGORA_CP_BANDS.EMERGING_MIN) return 'emerging';

	return 'contested';
}

/** One band of the record: what the AI said about it, and which answers it covers */
export const AgoraCpBandSummarySchema = object({
	band: AgoraCpBandSchema,
	/** The AI's line about this band, in the session language */
	text: string(),
	/** The carried answers that landed in it, strongest C_p first */
	statementIds: array(string()),
	/** The band's mean C_p, for the panel's one-figure line */
	consensus: number(),
});

export type AgoraCpBandSummary = InferOutput<typeof AgoraCpBandSummarySchema>;

/**
 * Split rows into bands, strongest first, dropping bands nothing landed in.
 * Rows keep the order they arrive in, so a C_p-sorted input stays sorted.
 */
export function groupByCpBand<T extends CpBandRow>(
	rows: readonly T[],
): { band: AgoraCpBand; rows: T[] }[] {
	return AGORA_CP_BAND_ORDER.map((band) => ({
		band,
		rows: rows.filter((row) => agoraCpBand(row) === band),
	})).filter((group) => group.rows.length > 0);
}

/** Rank by C_p — the record's order, as against `rankCarriedAnswers`' mean */
export function rankByCp<T extends CpBandRow & { statementId: string }>(
	rows: readonly T[],
): T[] {
	return [...rows].sort((a, b) => {
		const aRated = a.raters > 0 ? 1 : 0;
		const bRated = b.raters > 0 ? 1 : 0;
		if (aRated !== bRated) return bRated - aRated;
		const diff = cpOf(b) - cpOf(a);
		if (diff !== 0) return diff;
		if (b.raters !== a.raters) return b.raters - a.raters;

		return a.statementId < b.statementId ? -1 : a.statementId > b.statementId ? 1 : 0;
	});
}
