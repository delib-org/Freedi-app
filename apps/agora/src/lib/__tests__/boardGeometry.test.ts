import { describe, expect, it } from 'vitest';
import { AgoraCamp, type AgoraProposalScore, type AgoraRatingDist } from '@freedi/shared-types';
import { BRIDGE_ZONE, campLean, inBridgeZone } from '../boardGeometry';

/**
 * A score doc with only the parts the map reads: the per-camp histograms
 * (the horizontal axis) and the class consensus (the vertical one).
 */
function score(
	left: AgoraRatingDist,
	right: AgoraRatingDist,
	consensus: number | undefined,
): AgoraProposalScore {
	const camp = (dist: AgoraRatingDist): AgoraProposalScore['perCamp']['left'] => ({
		sum: 0,
		n: dist.reduce((total, count) => total + count, 0),
		positiveN: dist[3] + dist[4],
		studentDist: dist,
	});
	const n = camp(left).n + camp(right).n;

	return {
		statementId: 'p1',
		sessionId: 's1',
		authorCamp: AgoraCamp.center,
		perCamp: { left: camp(left), right: camp(right), center: camp([0, 0, 0, 0, 0]) },
		bridgingScore: 0,
		lastUpdate: 0,
		classConsensus:
			consensus === undefined
				? undefined
				: {
						consensus,
						mean: consensus,
						n,
						eligible: n,
						coverage: 1,
						normalized: 1,
						polarization: 0,
					},
	};
}

describe('boardGeometry', () => {
	describe('campLean', () => {
		it('is 0 when both camps back a proposal equally', () => {
			expect(campLean(score([0, 0, 0, 1, 2], [0, 0, 0, 1, 2], 0.5))).toBe(0);
		});

		it('leans -1 when only the left camp backs it, +1 when only the right does', () => {
			expect(campLean(score([0, 0, 0, 0, 3], [3, 0, 0, 0, 0], 0.1))).toBe(-1);
			expect(campLean(score([3, 0, 0, 0, 0], [0, 0, 0, 0, 3], 0.1))).toBe(1);
		});

		it('counts a half-mark as half the backing of a full one', () => {
			// Left: two half-marks = 1. Right: one full mark = 1. Even.
			expect(campLean(score([0, 0, 0, 2, 0], [0, 0, 0, 0, 1], 0.4))).toBe(0);
		});
	});

	describe('inBridgeZone — the goal', () => {
		it('scores a proposal both camps back with enough of the class behind it', () => {
			expect(inBridgeZone(score([0, 0, 0, 1, 3], [0, 0, 0, 1, 3], 0.6))).toBe(true);
		});

		it('is exactly the drawn box: the threshold row counts, one below does not', () => {
			const at = BRIDGE_ZONE.MIN_PERCENT / 100;
			expect(inBridgeZone(score([0, 0, 0, 0, 2], [0, 0, 0, 0, 2], at))).toBe(true);
			expect(inBridgeZone(score([0, 0, 0, 0, 2], [0, 0, 0, 0, 2], at - 0.01))).toBe(false);
		});

		it('is not a goal when only one camp is behind it, however high it scores', () => {
			expect(inBridgeZone(score([0, 0, 0, 0, 6], [6, 0, 0, 0, 0], 0.9))).toBe(false);
		});

		it('is never a goal for a proposal nobody has rated', () => {
			// Percent 0 and lean 0 is dead centre of the map, not a bridge
			expect(inBridgeZone(score([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], undefined))).toBe(false);
			expect(inBridgeZone(score([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 0.5))).toBe(false);
			expect(inBridgeZone(undefined)).toBe(false);
		});
	});
});
