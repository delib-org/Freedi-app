import type { Statement, StatementEvaluation } from '@freedi/shared-types';
import { calculateEvaluation } from '../agreementCalculation';
import type { CalcDiff } from '../evaluationTypes';

const NO_PRO_CON: CalcDiff = {
	proDiff: 0,
	conDiff: 0,
	proEvaluatorsDiff: 0,
	conEvaluatorsDiff: 0,
};

/**
 * A statement carrying an already-accumulated evaluation, so calculateEvaluation
 * scores the existing aggregates rather than a single incoming vote.
 */
function statementWith(evaluation: Partial<StatementEvaluation>): Statement {
	return {
		consensus: 0,
		totalEvaluators: evaluation.numberOfEvaluators ?? 0,
		evaluation: {
			agreement: 0,
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			averageEvaluation: 0,
			sumSquaredEvaluations: 0,
			evaluationRandomNumber: 0.5,
			viewed: 0,
			...evaluation,
		},
	} as unknown as Statement;
}

/** Score the given aggregates with no incoming change, at population N */
function score(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
	populationSize?: number,
) {
	return calculateEvaluation(
		statementWith({ sumEvaluations, sumSquaredEvaluations, numberOfEvaluators }),
		NO_PRO_CON,
		0,
		0,
		0,
		populationSize,
	);
}

describe('calculateEvaluation - stakeholder population', () => {
	it('is unchanged when no stakeholder count is known', () => {
		// Every deliberation with open participation goes down this path, so it
		// must produce exactly what it produced before the correction existed.
		const { agreement } = score(5, 5, 5);
		expect(agreement).toBe(0.32960130909890284);
	});

	it('treats an undefined population identically to omitting it', () => {
		expect(score(9, 11, 15, undefined).agreement).toBe(score(9, 11, 15).agreement);
	});

	it('returns the plain mean once every stakeholder has spoken', () => {
		// Five stakeholders, five votes, all +1. There is nobody left to be
		// uncertain about, so the score is the mean and not a hedge against it.
		const { agreement, evaluation } = score(5, 5, 5, 5);
		expect(agreement).toBe(1);
		expect(agreement).toBe(evaluation.averageEvaluation);
	});

	it('returns the mean at census even when the group is divided', () => {
		// Six stakeholders, three for and three against: the honest answer is 0,
		// not a negative number invented by a confidence penalty.
		const { agreement } = score(0, 6, 6, 6);
		expect(agreement).toBe(0);
	});

	it('barely moves when a large stakeholder body has barely spoken', () => {
		// 50 of 500 residents. A small self-selected poll must stay humble.
		const withoutN = score(30, 34, 50).agreement;
		const withN = score(30, 34, 50, 500).agreement;
		expect(withN).toBeGreaterThan(withoutN);
		expect(withN - withoutN).toBeLessThan(0.02);
	});

	it('rises as more of a fixed stakeholder body weighs in', () => {
		const partial = score(20, 24, 40, 500).agreement;
		const most = score(200, 240, 400, 500).agreement;
		expect(most).toBeGreaterThan(partial);
	});

	it('leaves like-mindedness untouched by the population', () => {
		// Dispersion is not a sampling quantity: how divided a group is cannot
		// depend on how many of them we managed to hear from.
		const open = score(9, 11, 15).evaluation.likeMindedness;
		const census = score(9, 11, 15, 15).evaluation.likeMindedness;
		expect(census).toBe(open);
	});

	it('ignores a degenerate population rather than reading it as a census', () => {
		// A zeroed or corrupted count must not hand out a perfect score.
		for (const bad of [0, -10, NaN]) {
			expect(score(5, 5, 5, bad).agreement).toBe(score(5, 5, 5).agreement);
		}
	});
});
