import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { selectBatch } from '../proposalSampler';
import { CLASS_SAMPLING_CONFIG, adjustedPriority, isStable, statsOf } from '../samplingMath';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** A seeded random in [0, 1) (mulberry32), so every run picks the same. */
function seeded(seed: number): () => number {
	let a = seed;

	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function proposal(id: string, n = 0, mean = 0, createdAt = NOW - 2 * HOUR): Statement {
	return {
		statementId: id,
		statement: id,
		createdAt,
		evaluation: {
			numberOfEvaluators: n,
			sumEvaluations: n * mean,
			sumSquaredEvaluations: n * mean * mean,
		},
	} as unknown as Statement;
}

/** Enough agreeing ratings to be stable (>= 30 evaluators, small SEM). */
function stable(id: string): Statement {
	return proposal(id, 40, 0.5);
}

describe('samplingMath', () => {
	it('a proposal with no ratings sits at the prior with wide uncertainty', () => {
		const stats = statsOf(proposal('a'), CLASS_SAMPLING_CONFIG);
		expect(stats.posteriorMean).toBe(0);
		expect(stats.sem).toBe(0.5);
		expect(stats.evaluationCount).toBe(0);
	});

	it('the prior keeps one early rating from deciding a proposal', () => {
		const stats = statsOf(proposal('a', 1, -1), CLASS_SAMPLING_CONFIG);
		expect(stats.mean).toBe(-1);
		expect(stats.posteriorMean).toBeCloseTo(-1 / 3);
	});

	it('marks a well-rated proposal stable and a fresh one unstable', () => {
		expect(isStable(stable('s'), CLASS_SAMPLING_CONFIG)).toBe(true);
		expect(isStable(proposal('a', 3, 0.5), CLASS_SAMPLING_CONFIG)).toBe(false);
	});

	it('priority stays within [floor, 1] for unstable proposals', () => {
		const env = { config: CLASS_SAMPLING_CONFIG, random: seeded(1), now: NOW };
		for (const p of [proposal('a'), proposal('b', 5, -0.8), proposal('c', 5, 0.9, NOW)]) {
			const priority = adjustedPriority(p, env);
			expect(priority).toBeGreaterThanOrEqual(CLASS_SAMPLING_CONFIG.explorationFloor);
			expect(priority).toBeLessThanOrEqual(1);
		}
	});

	it('stable proposals get the low stable priority', () => {
		const env = { config: CLASS_SAMPLING_CONFIG, random: seeded(2), now: NOW };
		expect(adjustedPriority(stable('s'), env)).toBeLessThan(0.1);
	});
});

describe('selectBatch (classroom rule: stable is served later, never dropped)', () => {
	it('serves six at a time', () => {
		const pool = Array.from({ length: 10 }, (_, i) => proposal(`p${i}`));
		expect(selectBatch(pool, { random: seeded(3), now: NOW })).toHaveLength(6);
	});

	it('serves all when there are six or fewer', () => {
		const pool = Array.from({ length: 4 }, (_, i) => proposal(`p${i}`));
		expect(
			selectBatch(pool, { random: seeded(4), now: NOW })
				.map((p) => p.statementId)
				.sort(),
		).toEqual(['p0', 'p1', 'p2', 'p3']);
	});

	it('puts unstable proposals before stable ones', () => {
		const pool = [stable('s1'), proposal('u1'), stable('s2'), proposal('u2')];
		const batch = selectBatch(pool, { count: 2, random: seeded(5), now: NOW });
		expect(batch.map((p) => p.statementId).sort()).toEqual(['u1', 'u2']);
	});

	it('still serves stable proposals once the unstable ones are gone', () => {
		const pool = [stable('s1'), stable('s2')];
		expect(selectBatch(pool, { random: seeded(6), now: NOW })).toHaveLength(2);
	});

	it('returns nothing for an empty pool or a zero count', () => {
		expect(selectBatch([], { now: NOW })).toEqual([]);
		expect(selectBatch([proposal('a')], { count: 0, now: NOW })).toEqual([]);
	});

	it('is deterministic for a given random source', () => {
		const pool = Array.from({ length: 12 }, (_, i) => proposal(`p${i}`, i % 4, (i % 3) - 1));
		const first = selectBatch(pool, { random: seeded(7), now: NOW }).map((p) => p.statementId);
		const again = selectBatch(pool, { random: seeded(7), now: NOW }).map((p) => p.statementId);
		expect(again).toEqual(first);
	});
});
