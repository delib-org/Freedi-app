import { computeClusterEvaluationFromRawEvals } from '../aggregation';
import type { Evaluation } from '@freedi/shared-types';

/**
 * `computeClusterEvaluationFromRawEvals` is the pure core of cluster
 * evaluation aggregation. These tests pin down:
 *   1. Per-user deduplication: a user who evaluated multiple cluster members
 *      counts once, using the average of their per-option evaluations.
 *   2. Zero-evaluator clusters still produce a valid (all-zero) snapshot so
 *      UI selectors never see undefined.
 *   3. Pro / con / neutral tallies partition the evaluators correctly.
 *   4. `existingRandom` / `existingViewed` are preserved so downstream
 *      stable-order selectors keep working across recomputes.
 */

function evalRec(opts: {
	evaluatorId: string;
	statementId: string;
	value: number;
	updatedAt?: number;
}): Evaluation {
	return {
		evaluationId: `${opts.evaluatorId}-${opts.statementId}`,
		evaluatorId: opts.evaluatorId,
		statementId: opts.statementId,
		parentId: 'parent',
		topParentId: 'parent',
		evaluation: opts.value,
		updatedAt: opts.updatedAt ?? 0,
		createdAt: 0,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('computeClusterEvaluationFromRawEvals', () => {
	it('returns zero-state evaluation for an empty input', () => {
		const { evaluation, byUser, perUserAverages } = computeClusterEvaluationFromRawEvals([]);

		expect(evaluation.numberOfEvaluators).toBe(0);
		expect(evaluation.sumEvaluations).toBe(0);
		expect(evaluation.agreement).toBe(0);
		expect(evaluation.averageEvaluation).toBe(0);
		expect(byUser.size).toBe(0);
		expect(perUserAverages.size).toBe(0);
	});

	it('deduplicates evaluators across multiple member options', () => {
		// User A evaluated options X and Y (should count once, as average).
		// User B evaluated only option X (should count once).
		// User C evaluated options X, Y, Z (should count once, as average).
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: 'A', statementId: 'X', value: 1 }),
			evalRec({ evaluatorId: 'A', statementId: 'Y', value: -1 }),
			evalRec({ evaluatorId: 'B', statementId: 'X', value: 1 }),
			evalRec({ evaluatorId: 'C', statementId: 'X', value: 0.5 }),
			evalRec({ evaluatorId: 'C', statementId: 'Y', value: 0.5 }),
			evalRec({ evaluatorId: 'C', statementId: 'Z', value: 0.5 }),
		];

		const { evaluation, byUser, perUserAverages } = computeClusterEvaluationFromRawEvals(evals);

		expect(evaluation.numberOfEvaluators).toBe(3);
		expect(byUser.size).toBe(3);
		// A: avg(1, -1) = 0; B: avg(1) = 1; C: avg(0.5, 0.5, 0.5) = 0.5
		expect(perUserAverages.get('A')).toBeCloseTo(0);
		expect(perUserAverages.get('B')).toBeCloseTo(1);
		expect(perUserAverages.get('C')).toBeCloseTo(0.5);
		// sumEvaluations = 0 + 1 + 0.5
		expect(evaluation.sumEvaluations).toBeCloseTo(1.5);
	});

	it('partitions evaluators into pro / con by their averaged value', () => {
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: 'P1', statementId: 'X', value: 1 }),
			evalRec({ evaluatorId: 'P2', statementId: 'X', value: 0.8 }),
			evalRec({ evaluatorId: 'C1', statementId: 'X', value: -1 }),
			evalRec({ evaluatorId: 'C2', statementId: 'Y', value: -0.5 }),
			// Neutral user: avg = 0, not counted as pro OR con.
			evalRec({ evaluatorId: 'N1', statementId: 'X', value: 1 }),
			evalRec({ evaluatorId: 'N1', statementId: 'Y', value: -1 }),
		];

		const { evaluation } = computeClusterEvaluationFromRawEvals(evals);

		expect(evaluation.numberOfEvaluators).toBe(5);
		expect(evaluation.numberOfProEvaluators).toBe(2);
		expect(evaluation.numberOfConEvaluators).toBe(2);
		expect(evaluation.sumPro).toBeCloseTo(1.8); // 1 + 0.8
		expect(evaluation.sumCon).toBeCloseTo(1.5); // |-1| + |-0.5|
	});

	it('preserves existingRandom / existingViewed when provided', () => {
		const evals: Evaluation[] = [evalRec({ evaluatorId: 'A', statementId: 'X', value: 0.5 })];

		const { evaluation } = computeClusterEvaluationFromRawEvals(evals, {}, 0.42, 7);

		expect(evaluation.evaluationRandomNumber).toBe(0.42);
		expect(evaluation.viewed).toBe(7);
	});

	it('falls back to a random evaluationRandomNumber when none is provided', () => {
		const evals: Evaluation[] = [evalRec({ evaluatorId: 'A', statementId: 'X', value: 0.5 })];

		const { evaluation } = computeClusterEvaluationFromRawEvals(evals);

		expect(typeof evaluation.evaluationRandomNumber).toBe('number');
		// Sanity: a random value in [0, 1)
		expect(evaluation.evaluationRandomNumber).toBeGreaterThanOrEqual(0);
		expect(evaluation.evaluationRandomNumber).toBeLessThan(1);
	});

	it('ignores evaluations missing an evaluatorId', () => {
		const evals: Evaluation[] = [
			evalRec({ evaluatorId: '', statementId: 'X', value: 1 }),
			evalRec({ evaluatorId: 'A', statementId: 'X', value: 1 }),
		];

		const { evaluation } = computeClusterEvaluationFromRawEvals(evals);

		expect(evaluation.numberOfEvaluators).toBe(1);
	});
});
