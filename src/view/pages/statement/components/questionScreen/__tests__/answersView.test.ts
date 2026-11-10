import {
	EvaluationUI,
	QuestionStep,
	SortType,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import { buildRateViewPath } from '../answerSorting';
import { isRateViewEligible, resolveAnswersView, ResolveAnswersViewInput } from '../answersView';

const NOW = 1_000_000;

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q',
		statementType: StatementType.question,
		questionSettings: {},
		statementSettings: {},
		...overrides,
	} as Statement;
}

function eligible(statement: Statement | undefined, answerCount = 31): boolean {
	return isRateViewEligible({ statement, answerCount, now: NOW });
}

describe('isRateViewEligible', () => {
	it('keeps the plain list at 30 answers', () => {
		expect(eligible(question(), 30)).toBe(false);
	});

	it('opens the Rate view at 31 answers', () => {
		expect(eligible(question(), 31)).toBe(true);
	});

	it('leaves anything but a question alone', () => {
		expect(eligible(question({ statementType: StatementType.option }))).toBe(false);
		expect(eligible(undefined)).toBe(false);
	});

	it('leaves the voting UI alone', () => {
		expect(
			eligible(
				question({
					evaluationSettings: { evaluationUI: EvaluationUI.voting },
				} as Partial<Statement>),
			),
		).toBe(false);
	});

	it.each([
		['collecting', QuestionStep.suggestion],
		['voting', QuestionStep.voting],
		['decided', QuestionStep.finished],
	])('is off in the %s stage', (_stage, currentStep) => {
		expect(eligible(question({ questionSettings: { currentStep } } as Partial<Statement>))).toBe(
			false,
		);
	});

	it('is on in the rating stage the host set', () => {
		expect(
			eligible(
				question({
					questionSettings: { currentStep: QuestionStep.randomEvaluation },
				} as Partial<Statement>),
			),
		).toBe(true);
	});

	it('is off when rating is closed', () => {
		expect(
			eligible(question({ statementSettings: { enableEvaluation: false } } as Partial<Statement>)),
		).toBe(false);
		expect(eligible(question({ questionSettings: { isHalted: true } } as Partial<Statement>))).toBe(
			false,
		);
		expect(
			eligible(question({ questionSettings: { deadline: NOW - 1 } } as Partial<Statement>)),
		).toBe(false);
	});
});

describe('resolveAnswersView', () => {
	const base: ResolveAnswersViewInput = {
		eligible: true,
		usesPlainList: false,
		paramSort: undefined,
		hasManualOrder: false,
		seeAll: false,
	};

	it('opens on Rate for an eligible question', () => {
		expect(resolveAnswersView(base)).toEqual({ view: 'rate', canReturnToRating: false });
	});

	it('treats the random sort as Rate', () => {
		expect(resolveAnswersView({ ...base, paramSort: SortType.random }).view).toBe('rate');
	});

	it('goes to the full list with See all answers, and offers the way back', () => {
		expect(resolveAnswersView({ ...base, seeAll: true })).toEqual({
			view: 'list',
			canReturnToRating: true,
		});
	});

	it('honours a sort the reader chose, and offers the way back', () => {
		expect(resolveAnswersView({ ...base, paramSort: SortType.newest })).toEqual({
			view: 'list',
			canReturnToRating: true,
		});
	});

	it('uses the list without a way back when the question is small', () => {
		expect(resolveAnswersView({ ...base, eligible: false, seeAll: true })).toEqual({
			view: 'list',
			canReturnToRating: false,
		});
	});

	it('falls back to the list when the sampler is unavailable', () => {
		expect(resolveAnswersView({ ...base, usesPlainList: true }).view).toBe('list');
	});

	it("keeps a host's hand-placed order", () => {
		expect(resolveAnswersView({ ...base, hasManualOrder: true }).view).toBe('list');
	});
});

describe('buildRateViewPath', () => {
	it('drops the sort and keeps the tab', () => {
		expect(buildRateViewPath('/statement/q/newest', 'q', 'options')).toBe(
			'/statement/q?tab=options',
		);
	});

	it('stays in the stage family', () => {
		expect(buildRateViewPath('/stage/q', 'q', null)).toBe('/stage/q');
	});
});
