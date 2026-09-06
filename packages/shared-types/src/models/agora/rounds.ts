/**
 * The WizCol rounds — the beats between the intro and the square.
 *
 * Each round is the same shape with a different scale: every student writes
 * one text, reads a few classmates' texts (dealt by the square's attention
 * allocator, least-attended first), weighs each on the round's own scale, and
 * the round closes with an AI record that travels into every later stage.
 * The scale is the whole difference between the rounds, so it lives in ONE
 * table both the client and the functions read — a screen that showed hearts
 * for a round the server scored 0…1 would be lying about its own numbers.
 *
 * Every rating is an ordinary evaluation (a −1…+1 number) so the shared
 * pipeline keeps the counts. A like is `1`, an un-like is `0` (never a
 * delete — a deleted evaluation re-runs the effort credit when it comes back
 * and reshuffles the rater count under a reading finger), and the unit scale
 * writes its step verbatim. Nothing below the challenge question ever sees
 * these values: the camp tally and C_p are gated on `parentId ===
 * challengeQuestionId`, so a 0…1 mean never meets a −1…+1 formula.
 */

import { AgoraStage } from './agoraEnums';
import { AGORA_CYCLE, AGORA_POINTS } from './agoraConstants';
import type { AgoraCarriedAnswer } from './stagePlan';

export type AgoraRoundKind = AgoraStage.story | AgoraStage.myNeeds | AgoraStage.vision;

export const AGORA_ROUND_KINDS: readonly AgoraRoundKind[] = [
	AgoraStage.story,
	AgoraStage.myNeeds,
	AgoraStage.vision,
];

export const AGORA_ROUND = {
	/** Stories dealt to each reader — the square's own batch */
	STORY_SAMPLE: AGORA_CYCLE.RATINGS_PER_ROUND,
	/** Needs and visions dealt to each reader — twice the batch, they are shorter */
	WIDE_SAMPLE: 2 * AGORA_CYCLE.RATINGS_PER_ROUND,
	LIKE: 1,
	UNLIKE: 0,
	UNIT_STEPS: [0, 0.25, 0.5, 0.75, 1] as const,
	/** A unit rating at or above this pays the author */
	UNIT_APPRECIATED_MIN: 0.5,
} as const;

export type AgoraUnitRating = (typeof AGORA_ROUND.UNIT_STEPS)[number];

export type AgoraRoundScale = 'like' | 'unit';

/** What the AI writes when the round closes */
export type AgoraRoundSummary = 'stories' | 'needs' | 'merge';

export interface AgoraRoundSpec {
	kind: AgoraRoundKind;
	scale: AgoraRoundScale;
	/** Classmates' texts dealt to each reader */
	sample: number;
	/** A received rating at or above `minRating` pays the author `points`, once per rater */
	appreciation: { minRating: number; points: number };
	summary: AgoraRoundSummary;
}

export const AGORA_ROUNDS: Record<AgoraRoundKind, AgoraRoundSpec> = {
	[AgoraStage.story]: {
		kind: AgoraStage.story,
		scale: 'like',
		sample: AGORA_ROUND.STORY_SAMPLE,
		appreciation: { minRating: AGORA_ROUND.LIKE, points: AGORA_POINTS.ROUND_APPRECIATION },
		summary: 'stories',
	},
	[AgoraStage.myNeeds]: {
		kind: AgoraStage.myNeeds,
		scale: 'unit',
		sample: AGORA_ROUND.WIDE_SAMPLE,
		appreciation: {
			minRating: AGORA_ROUND.UNIT_APPRECIATED_MIN,
			points: AGORA_POINTS.ROUND_APPRECIATION,
		},
		summary: 'needs',
	},
	[AgoraStage.vision]: {
		kind: AgoraStage.vision,
		scale: 'unit',
		sample: AGORA_ROUND.WIDE_SAMPLE,
		appreciation: {
			minRating: AGORA_ROUND.UNIT_APPRECIATED_MIN,
			points: AGORA_POINTS.ROUND_APPRECIATION,
		},
		summary: 'merge',
	},
};

export function isRoundStage(stage: AgoraStage): stage is AgoraRoundKind {
	return (AGORA_ROUND_KINDS as readonly AgoraStage[]).includes(stage);
}

/** The stages whose answers hang off their own question Statement and whose record travels forward */
export function isCarryStage(stage: AgoraStage): boolean {
	return stage === AgoraStage.question || isRoundStage(stage);
}

/**
 * Hearts on a story. With likes written as 1 and un-likes as 0 the shared
 * pipeline's own mean × count IS the like count — no second ledger.
 */
export function roundLikes(row: { mean: number; raters: number }): number {
	if (row.raters <= 0 || !Number.isFinite(row.mean)) return 0;

	return Math.max(0, Math.round(row.mean * row.raters));
}

/** Does this received rating pay the author? */
export function roundAppreciates(spec: Pick<AgoraRoundSpec, 'appreciation'>, value: number): boolean {
	return Number.isFinite(value) && value >= spec.appreciation.minRating;
}

/** Is this number one of the unit scale's steps? */
export function isUnitRating(value: number): value is AgoraUnitRating {
	return (AGORA_ROUND.UNIT_STEPS as readonly number[]).includes(value);
}

/**
 * The order a closed round lists its texts in: most appreciated first. A
 * story ranks by hearts, a need or a vision by its mean; unrated texts sit
 * last, and ties break on the id so every reader sees the same list.
 */
export function rankRoundAnswers(
	kind: AgoraRoundKind,
	rows: readonly AgoraCarriedAnswer[],
): AgoraCarriedAnswer[] {
	const score = (row: AgoraCarriedAnswer): number =>
		AGORA_ROUNDS[kind].scale === 'like' ? roundLikes(row) : row.raters > 0 ? row.mean : -1;

	return [...rows].sort((a, b) => {
		const aRated = a.raters > 0 ? 1 : 0;
		const bRated = b.raters > 0 ? 1 : 0;
		if (aRated !== bRated) return bRated - aRated;
		const diff = score(b) - score(a);
		if (diff !== 0) return diff;
		if (b.raters !== a.raters) return b.raters - a.raters;

		return a.statementId < b.statementId ? -1 : a.statementId > b.statementId ? 1 : 0;
	});
}

/** A student's way through a round: one text of their own, then the dealt sample */
export function roundProgress(
	answered: boolean,
	rated: number,
	sample: number,
): { done: number; total: number } {
	const total = 1 + sample;

	return { done: Math.min(total, (answered ? 1 : 0) + Math.max(0, rated)), total };
}
