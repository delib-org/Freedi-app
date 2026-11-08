import { calcAgreement, calcAgreementIndex } from '@freedi/shared-types';
import type { Evaluation, StatementEvaluation } from '@freedi/shared-types';
import { hasCounterMismatch, recomputeOptionCounters } from '../recomputeOptionCounters';

const votes = (...values: number[]): Pick<Evaluation, 'evaluation'>[] =>
	values.map((evaluation) => ({ evaluation }));

describe('recomputeOptionCounters', () => {
	it('counts zero-valued votes as participants', () => {
		const c = recomputeOptionCounters(votes(1, 0, 0, -1, 0.5));

		expect(c.numberOfEvaluators).toBe(5);
		expect(c.numberOfProEvaluators).toBe(2);
		expect(c.numberOfConEvaluators).toBe(1);
		expect(c.sumPro).toBeCloseTo(1.5);
		expect(c.sumCon).toBeCloseTo(1);
	});

	it('includes zeros in the denominator of the mean', () => {
		const c = recomputeOptionCounters(votes(1, 1, 0, 0));

		expect(c.sumEvaluations).toBe(2);
		expect(c.averageEvaluation).toBe(0.5); // not 1, which is what dropping zeros gave
	});

	it('is all-zero for no evaluations', () => {
		const c = recomputeOptionCounters([]);

		expect(c.numberOfEvaluators).toBe(0);
		expect(c.averageEvaluation).toBe(0);
		expect(c.agreement).toBe(0);
		expect(c.stakeholderCount).toBeUndefined();
	});

	it('without N uses the 3-arg formulas and sets no stakeholderCount', () => {
		const c = recomputeOptionCounters(votes(1, 0.5, -0.5, 0));

		expect(c.agreement).toBe(calcAgreement(1, 1.5, 4));
		expect(c.agreementIndex).toBe(calcAgreementIndex(1, 1.5, 4));
		expect('stakeholderCount' in c).toBe(false);
	});

	it('with N uses the 4-arg formulas and stakeholderCount = max(N, n)', () => {
		const c = recomputeOptionCounters(votes(1, 0.5, -0.5, 0), 40);

		expect(c.agreement).toBe(calcAgreement(1, 1.5, 4, 40));
		expect(c.agreementIndex).toBe(calcAgreementIndex(1, 1.5, 4, 40));
		expect(c.stakeholderCount).toBe(40);
		expect(c.agreement).not.toBe(calcAgreement(1, 1.5, 4));
	});

	it('floors stakeholderCount at the evaluator count when N is smaller', () => {
		expect(recomputeOptionCounters(votes(1, 1, 1), 2).stakeholderCount).toBe(3);
	});
});

describe('hasCounterMismatch', () => {
	const storedFrom = (
		c: ReturnType<typeof recomputeOptionCounters>,
	): Partial<StatementEvaluation> => ({
		numberOfEvaluators: c.numberOfEvaluators,
		numberOfProEvaluators: c.numberOfProEvaluators,
		numberOfConEvaluators: c.numberOfConEvaluators,
		stakeholderCount: c.stakeholderCount,
	});

	it('finds no mismatch on a document the recompute itself produced (idempotent)', () => {
		const withoutN = recomputeOptionCounters(votes(1, 0, 0, -1));
		const withN = recomputeOptionCounters(votes(1, 0, 0, -1), 25);

		expect(hasCounterMismatch(storedFrom(withoutN), withoutN)).toBe(false);
		expect(hasCounterMismatch(storedFrom(withN), withN)).toBe(false);
	});

	it('flags a stale stakeholderCount when there is no explicit N any more', () => {
		const c = recomputeOptionCounters(votes(1, 1));

		expect(hasCounterMismatch({ ...storedFrom(c), stakeholderCount: 119 }, c)).toBe(true);
	});

	it('flags all 68 options whose stored count equals their non-zero count', () => {
		// Production shape: each option has some zero votes; the doc was written by
		// the non-zero rule, so stored == non-zero count < doc count.
		const flagged = Array.from({ length: 68 }, (_, i) => {
			const zeros = (i % 5) + 1;
			const nonZero = 3 + (i % 4);
			const evals = votes(...Array(nonZero).fill(1), ...Array(zeros).fill(0));
			const computed = recomputeOptionCounters(evals);
			const stored: Partial<StatementEvaluation> = {
				numberOfEvaluators: nonZero,
				numberOfProEvaluators: nonZero,
				numberOfConEvaluators: 0,
			};

			return hasCounterMismatch(stored, computed);
		});

		expect(flagged.every(Boolean)).toBe(true);
	});

	it('flags a document missing evaluation entirely when evaluations exist', () => {
		expect(hasCounterMismatch(undefined, recomputeOptionCounters(votes(0)))).toBe(true);
	});
});
