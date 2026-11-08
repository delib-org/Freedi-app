import { EvaluationUI, QuestionStep, Statement, StatementType } from '@freedi/shared-types';
import {
	STAGE_TO_STEP,
	getQuestionStage,
	segmentState,
	showsStageBar,
	stageFromStep,
} from '../questionStage';

const NOW = 1_000_000;

function question(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		statement: 'Q',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: 'q1',
		creatorId: 'u1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

describe('questionStage', () => {
	describe('stageFromStep', () => {
		it.each([
			[QuestionStep.explanation, 0],
			[QuestionStep.suggestion, 0],
			[QuestionStep.randomEvaluation, 1],
			[QuestionStep.topEvaluation, 1],
			[QuestionStep.voting, 2],
			[QuestionStep.finished, 3],
		])('maps %s to stage %i', (step, stage) => {
			expect(stageFromStep(step)).toBe(stage);
		});

		it('says nothing for other / missing', () => {
			expect(stageFromStep(QuestionStep.other)).toBeUndefined();
			expect(stageFromStep(undefined)).toBeUndefined();
		});
	});

	describe('getQuestionStage', () => {
		it('an explicit step wins over every derived rule', () => {
			const statement = question({
				questionSettings: { currentStep: QuestionStep.voting, deadline: NOW - 1 },
			} as Partial<Statement>);
			expect(getQuestionStage({ statement, answerCount: 0, now: NOW })).toBe(2);
		});

		it('derives decided from a passed deadline', () => {
			const statement = question({ questionSettings: { deadline: NOW - 1 } } as Partial<Statement>);
			expect(getQuestionStage({ statement, answerCount: 4, now: NOW })).toBe(3);
		});

		it('a future deadline does not decide', () => {
			const statement = question({ questionSettings: { deadline: NOW + 1 } } as Partial<Statement>);
			expect(getQuestionStage({ statement, answerCount: 4, now: NOW })).toBe(1);
		});

		it('derives voting from the voting UI', () => {
			const statement = question({
				evaluationSettings: { evaluationUI: EvaluationUI.voting },
			} as Partial<Statement>);
			expect(getQuestionStage({ statement, answerCount: 4, now: NOW })).toBe(2);
		});

		it('derives collecting when ratings are off or nothing exists yet', () => {
			expect(
				getQuestionStage({
					statement: question({
						statementSettings: { enableEvaluation: false },
					} as Partial<Statement>),
					answerCount: 4,
					now: NOW,
				}),
			).toBe(0);
			expect(getQuestionStage({ statement: question(), answerCount: 0, now: NOW })).toBe(0);
		});

		it('otherwise rating; `other` falls through to the derived rules', () => {
			expect(getQuestionStage({ statement: question(), answerCount: 3, now: NOW })).toBe(1);
			const other = question({
				questionSettings: { currentStep: QuestionStep.other },
			} as Partial<Statement>);
			expect(getQuestionStage({ statement: other, answerCount: 0, now: NOW })).toBe(0);
		});

		it('an unknown statement is collecting', () => {
			expect(getQuestionStage({ statement: undefined, answerCount: 0, now: NOW })).toBe(0);
		});
	});

	it('STAGE_TO_STEP round-trips through stageFromStep', () => {
		([0, 1, 2, 3] as const).forEach((stage) => {
			expect(stageFromStep(STAGE_TO_STEP[stage])).toBe(stage);
		});
	});

	it('shows the bar for questions only', () => {
		expect(showsStageBar(question())).toBe(true);
		expect(showsStageBar(question({ statementType: StatementType.group }))).toBe(false);
		expect(showsStageBar(question({ statementType: StatementType.statement }))).toBe(false);
		expect(showsStageBar(undefined)).toBe(false);
	});

	it('segmentState marks done / active / future', () => {
		expect([0, 1, 2, 3].map((i) => segmentState(i, 2))).toEqual([
			'done',
			'done',
			'active',
			'future',
		]);
	});
});
