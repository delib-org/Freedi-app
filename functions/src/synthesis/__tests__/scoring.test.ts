import { bayesianFilterOptions, computePriorAndSigma } from '../scoring';
import type { Statement } from '@freedi/shared-types';

/**
 * Bayesian filter pins the long-tail behavior: high-evidence options near
 * or above the prior survive; low-evidence outliers (one +1 vote) get
 * shrunk back toward the prior and dropped.
 */

function opt(id: string, consensus: number, numberOfEvaluators: number): Statement {
	return {
		statementId: id,
		statement: id,
		consensus,
		evaluation: { numberOfEvaluators, agreement: consensus },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('computePriorAndSigma', () => {
	it('returns 0/0 for an empty input', () => {
		const { prior, sigma } = computePriorAndSigma([]);
		expect(prior).toBe(0);
		expect(sigma).toBe(0);
	});

	it('computes prior as the mean of consensus values', () => {
		const stmts = [opt('a', 0.5, 5), opt('b', -0.5, 5), opt('c', 0, 5)];
		const { prior } = computePriorAndSigma(stmts);
		// (0.5 + -0.5 + 0) / 3 = 0
		expect(prior).toBeCloseTo(0);
	});

	it('computes sigma as population stddev of consensus values', () => {
		const stmts = [opt('a', 1, 5), opt('b', -1, 5), opt('c', 1, 5), opt('d', -1, 5)];
		const { prior, sigma } = computePriorAndSigma(stmts);
		expect(prior).toBeCloseTo(0);
		// Variance = (1+1+1+1)/4 = 1; sigma = 1.
		expect(sigma).toBeCloseTo(1);
	});
});

describe('bayesianFilterOptions', () => {
	it('keeps options whose Bayesian score is above prior + 0.5σ', () => {
		// Mix of confident-good, loud-thin, and confident-bad options.
		const stmts = [
			opt('confident-good', 0.8, 50), // 50 votes at 0.8 — should keep
			opt('confident-mid', 0.0, 50), // 50 votes at 0.0 — borderline; depends on prior
			opt('confident-bad', -0.5, 50), // confident negative — should drop
			opt('loud-thin', 1.0, 1), // 1 vote at +1 — should be shrunk and dropped
			opt('zero-evals', 0.5, 0), // no votes — fully shrinks to prior
		];

		const { kept, stats } = bayesianFilterOptions(stmts, { priorWeight: 5, cutoffSigmas: 0.5 });
		const keptIds = kept.map((k) => k.statement.statementId);

		expect(keptIds).toContain('confident-good');
		expect(keptIds).not.toContain('confident-bad');
		expect(keptIds).not.toContain('loud-thin'); // shrinkage drops it below cutoff
		expect(keptIds).not.toContain('zero-evals'); // pure prior, never above cutoff (= prior + .5σ)
		expect(stats.inputCount).toBe(5);
		expect(stats.keptCount).toBe(kept.length);
	});

	it('emits accurate telemetry: prior, sigma, cutoff', () => {
		const stmts = [opt('a', 1, 10), opt('b', -1, 10), opt('c', 0.5, 10), opt('d', -0.5, 10)];
		const { stats } = bayesianFilterOptions(stmts);
		// prior = (1 + -1 + 0.5 + -0.5) / 4 = 0
		expect(stats.prior).toBeCloseTo(0);
		// sigma = sqrt((1 + 1 + 0.25 + 0.25) / 4) = sqrt(0.625) ≈ 0.7906
		expect(stats.sigma).toBeCloseTo(0.7906, 3);
		// cutoff = prior + 0.5 * sigma
		expect(stats.cutoff).toBeCloseTo(0 + 0.5 * 0.7906, 3);
	});

	it('respects minEvaluators floor independent of score', () => {
		const stmts = [
			opt('high-score-thin', 1, 1), // shrinks to ~prior + slight bias; also < minEvaluators
			opt('high-score-fat', 1, 50),
		];
		const { kept } = bayesianFilterOptions(stmts, { minEvaluators: 5 });
		const keptIds = kept.map((k) => k.statement.statementId);
		expect(keptIds).not.toContain('high-score-thin');
		expect(keptIds).toContain('high-score-fat');
	});

	it('shrinks an option with v=0 evaluators all the way to the prior', () => {
		const stmts = [opt('a', 0.8, 10), opt('b', -0.4, 10), opt('zero', 0.95, 0)];
		const { kept, dropped, stats } = bayesianFilterOptions(stmts);
		const zero = [...kept, ...dropped].find((s) => s.statement.statementId === 'zero');
		expect(zero).toBeDefined();
		expect(zero!.bayesianScore).toBeCloseTo(stats.prior);
	});

	it('handles empty input gracefully', () => {
		const result = bayesianFilterOptions([]);
		expect(result.kept).toEqual([]);
		expect(result.dropped).toEqual([]);
		expect(result.stats.inputCount).toBe(0);
		expect(result.stats.keptCount).toBe(0);
	});

	it('reads numberOfEvaluators from the nested evaluation object first, then falls back to totalEvaluators', () => {
		const withNested = opt('nested', 0.5, 10);

		const withLegacy: Statement = {
			statementId: 'legacy',
			statement: 'legacy',
			consensus: 0.5,
			totalEvaluators: 10,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		const result = bayesianFilterOptions([withNested, withLegacy]);
		const all = [...result.kept, ...result.dropped];
		expect(all.find((s) => s.statement.statementId === 'nested')!.evaluatorCount).toBe(10);
		expect(all.find((s) => s.statement.statementId === 'legacy')!.evaluatorCount).toBe(10);
	});
});
