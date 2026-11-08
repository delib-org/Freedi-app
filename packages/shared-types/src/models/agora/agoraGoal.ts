import type { AgoraProposalScore, AgoraRatingDist } from './agoraScore';

/**
 * The goal on the class map, as arithmetic rather than as CSS.
 *
 * The Agora results board draws a football goal at the top centre of its
 * field: a proposal standing inside it has scored — enough of the class
 * behind it, and both camps behind it fairly evenly. The board paints this
 * geometry, the milestone detector reads it, and the teacher may draw the
 * ballot from it (`VotingStageSettings.goalZoneOnly`), so it has to live in
 * ONE place that both the browser and the functions can import. A zone the
 * map paints in one geometry and the server selects in another would put a
 * proposal on the ballot that the class cannot see in the net.
 */

/** How much positive support one camp gave: half-marks count half */
export function backing(dist?: AgoraRatingDist): number {
	if (!dist) return 0;

	return 0.5 * Math.max(0, dist[3]) + Math.max(0, dist[4]);
}

/**
 * The horizontal axis: who is behind this proposal. -1 = only the left camp,
 * +1 = only the right, 0 = both sides equally.
 */
export function campLean(score: AgoraProposalScore): number {
	const left = backing(score.perCamp.left.studentDist);
	const right = backing(score.perCamp.right.studentDist);
	if (left + right === 0) return 0;

	return (right - left) / (right + left);
}

/** The vertical axis: the class's agreement, as a signed percent */
export function boardPercent(score: AgoraProposalScore | undefined): number {
	return score?.classConsensus ? Math.round(score.classConsensus.consensus * 100) : 0;
}

/**
 * The goal, in the map's own units.
 *
 * ⚠ These numbers ARE `.board__goal` in apps/agora/src/styles/components/
 * _board.scss, converted from its box to the axes the points are plotted on:
 *   inset-inline-start 28% + width 44% → x ∈ [28,72] → lean ∈ [−0.44, +0.44]
 *   inset-block-end 62% (bottom-based) → y ≥ 62      → percent ≥ 24
 * Change one and change the other, or the net and the cheer stop meaning
 * the same thing.
 */
export const BRIDGE_ZONE = {
	MIN_PERCENT: 24,
	MAX_LEAN: 0.44,
} as const;

/**
 * Is this proposal in the goal — enough of the class behind it, and both
 * camps behind it fairly evenly?
 *
 * Needs a real reading to be true: a proposal nobody has rated has percent 0
 * and lean 0, which is dead centre of the map but not remotely a bridge.
 */
export function inBridgeZone(score: AgoraProposalScore | undefined): boolean {
	if (!score?.classConsensus || score.classConsensus.n === 0) return false;

	return (
		boardPercent(score) >= BRIDGE_ZONE.MIN_PERCENT &&
		Math.abs(campLean(score)) <= BRIDGE_ZONE.MAX_LEAN
	);
}
