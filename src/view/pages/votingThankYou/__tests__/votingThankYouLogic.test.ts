import { QuestionStep, Statement, StatementType } from '@freedi/shared-types';
import { getNextStepKey } from '../votingThankYouLogic';

const NOW = 1000;

function question(currentStep: QuestionStep, settings: Record<string, unknown> = {}): Statement {
	return {
		statementType: StatementType.question,
		questionSettings: { currentStep, ...settings },
	} as unknown as Statement;
}

const keyFor = (statement: Statement | undefined): string =>
	getNextStepKey({ statement, answerCount: 3, now: NOW });

describe('getNextStepKey', () => {
	it.each([
		[QuestionStep.suggestion, 'thankYou.next.collecting'],
		[QuestionStep.randomEvaluation, 'thankYou.next.rating'],
		[QuestionStep.voting, 'thankYou.next.voting'],
		[QuestionStep.finished, 'thankYou.next.decided'],
	])('says what follows %s', (step, key) => {
		expect(keyFor(question(step))).toBe(key);
	});

	it('promises nothing before the statement has loaded', () => {
		expect(keyFor(undefined)).toBe('thankYou.next.unknown');
	});

	it('promises nothing for a statement that is not a question', () => {
		expect(keyFor({ statementType: StatementType.option } as Statement)).toBe(
			'thankYou.next.unknown',
		);
	});

	it('does not say people are still rating on a halted question', () => {
		expect(keyFor(question(QuestionStep.randomEvaluation, { isHalted: true }))).toBe(
			'thankYou.next.unknown',
		);
	});

	it('does not say people are still rating once the deadline has passed', () => {
		expect(keyFor(question(QuestionStep.randomEvaluation, { deadline: NOW - 1 }))).toBe(
			'thankYou.next.unknown',
		);
	});

	it('still reports a decision on a halted question', () => {
		expect(keyFor(question(QuestionStep.finished, { isHalted: true }))).toBe(
			'thankYou.next.decided',
		);
	});
});
