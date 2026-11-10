import { StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { resetSampler, sampleAnswers } from '../sampler';
import { isLargeForPresence } from '../config';
import type { PhaseCost } from '../metrics';
import { triggersPerStatementWrite } from '../reportMetrics';

function answer(id: string, numberOfEvaluators: number): Statement {
	return {
		statementId: id,
		statementType: StatementType.option,
		creatorId: 'author',
		evaluation: {
			numberOfEvaluators,
			sumEvaluations: numberOfEvaluators / 2,
			sumSquaredEvaluations: numberOfEvaluators / 2,
			agreement: 0.5,
			averageEvaluation: 0.5,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			evaluationRandomNumber: 0.5,
			viewed: numberOfEvaluators,
		},
	} as unknown as Statement;
}

const answers = Array.from({ length: 12 }, (_, index) => answer(`a${index}`, index));

describe('sampleAnswers', () => {
	it('never offers an answer the person already rated', () => {
		resetSampler();
		const ids = sampleAnswers(answers, ['a1', 'a2', 'a3'], 'rater', 6).map((a) => a.statementId);
		expect(ids).toHaveLength(6);
		expect(ids).not.toEqual(expect.arrayContaining(['a1']));
		expect(ids).not.toEqual(expect.arrayContaining(['a2']));
	});

	it('picks the same answers after a reset, and leaves Math.random alone', () => {
		const originalRandom = Math.random;
		resetSampler();
		const first = sampleAnswers(answers, [], 'rater', 6).map((a) => a.statementId);
		resetSampler();
		const second = sampleAnswers(answers, [], 'rater', 6).map((a) => a.statementId);
		expect(second).toEqual(first);
		expect(Math.random).toBe(originalRandom);
	});
});

describe('isLargeForPresence', () => {
	it('is off below 100 people and on at 100, from any counter', () => {
		expect(isLargeForPresence({ entered: 99, totalEvaluators: 12 })).toBe(false);
		expect(isLargeForPresence({ entered: 100 })).toBe(true);
		expect(isLargeForPresence({ asParentTotalEvaluators: 100 })).toBe(true);
		expect(isLargeForPresence({ totalEvaluators: 150 })).toBe(true);
	});
});

describe('triggersPerStatementWrite', () => {
	it('counts statement triggers, not rating triggers that happen to match in number', () => {
		const phase = {
			writesByCollection: { statements: 100 },
			byFunction: {
				newEvaluation: { invocations: 100 },
				queueDeliberation: { invocations: 100 },
				updateParentOnChildUpdate: { invocations: 100 },
				onNotificationQueued: { invocations: 7 },
			},
		} as unknown as PhaseCost;

		expect(triggersPerStatementWrite(phase)).toBe(2);
	});
});
