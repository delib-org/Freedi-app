import { EvaluationUI, QuestionStep, Statement, StatementType } from '@freedi/shared-types';
import { getQuestionStage, QuestionStageIndex } from '../questionStage';
import {
	StagePresetFields,
	applyStagePreset,
	differsFromStagePreset,
	stagePreset,
} from '../stagePreset';

const STAGES: readonly QuestionStageIndex[] = [0, 1, 2, 3];
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

/** Writes dot-path fields the way Firestore does: siblings of each key survive. */
function writeFields(statement: Statement, fields: StagePresetFields): Statement {
	const next = { ...statement } as unknown as Record<string, Record<string, unknown>>;
	Object.entries(fields).forEach(([path, value]) => {
		const [section, key] = path.split('.');
		next[section] = { ...next[section], [key]: value };
	});

	return next as unknown as Statement;
}

describe('stagePreset', () => {
	it.each([
		[0, true, true, false],
		[1, true, true, false],
		[2, false, true, false],
		[3, false, false, true],
	] as const)('stage %i: add %s, rate %s, live %s', (stage, addAnswers, rate, liveResults) => {
		expect(stagePreset(stage)).toEqual({ addAnswers, rate, liveResults });
	});
});

describe('applyStagePreset', () => {
	it.each([
		[0, QuestionStep.suggestion],
		[1, QuestionStep.randomEvaluation],
		[2, QuestionStep.voting],
		[3, QuestionStep.finished],
	] as const)('stage %i writes step %s', (stage, step) => {
		expect(applyStagePreset(question(), stage)['questionSettings.currentStep']).toBe(step);
	});

	it('writes both add flags, whichever UI the question runs', () => {
		const fields = applyStagePreset(question(), 2);
		expect(fields['statementSettings.enableAddEvaluationOption']).toBe(false);
		expect(fields['statementSettings.enableAddVotingOption']).toBe(false);
	});

	describe('evaluationUI', () => {
		const withUI = (evaluationUI: EvaluationUI) =>
			question({ evaluationSettings: { evaluationUI } } as Partial<Statement>);
		const uiOf = (statement: Statement, stage: QuestionStageIndex) =>
			applyStagePreset(statement, stage)['evaluationSettings.evaluationUI'];

		it('leaving voting returns to suggestions while collecting and rating', () => {
			expect(uiOf(withUI(EvaluationUI.voting), 0)).toBe(EvaluationUI.suggestions);
			expect(uiOf(withUI(EvaluationUI.voting), 1)).toBe(EvaluationUI.suggestions);
		});

		it('a question with no UI gets suggestions, so the add switch takes effect', () => {
			expect(uiOf(question(), 0)).toBe(EvaluationUI.suggestions);
		});

		it('voting always asks for the voting UI', () => {
			expect(uiOf(withUI(EvaluationUI.suggestions), 2)).toBe(EvaluationUI.voting);
		});

		it('writes nothing when the UI stays', () => {
			expect(uiOf(withUI(EvaluationUI.checkbox), 1)).toBeUndefined();
			expect(uiOf(withUI(EvaluationUI.suggestions), 0)).toBeUndefined();
			expect(uiOf(withUI(EvaluationUI.voting), 3)).toBeUndefined();
		});
	});

	it('uses only dot paths, so the rating scale and other settings survive', () => {
		const before = question({
			evaluationSettings: {
				evaluationUI: EvaluationUI.voting,
				targetPopulation: 500,
			},
			statementSettings: { hasChat: true },
		} as Partial<Statement>);
		const fields = applyStagePreset(before, 1);
		Object.keys(fields).forEach((path) => expect(path).toContain('.'));
		const after = writeFields(before, fields);
		expect(after.evaluationSettings?.targetPopulation).toBe(500);
		expect(after.statementSettings?.hasChat).toBe(true);
	});

	describe('round trip: getQuestionStage(applied) === picked', () => {
		const starts: ReadonlyArray<[string, Statement, number]> = [
			['blank, no answers', question(), 0],
			['blank, with answers', question(), 5],
			[
				'ratings switched off',
				question({ statementSettings: { enableEvaluation: false } } as Partial<Statement>),
				5,
			],
			[
				'running the voting UI',
				question({
					evaluationSettings: { evaluationUI: EvaluationUI.voting },
				} as Partial<Statement>),
				5,
			],
			[
				'deadline already passed',
				question({ questionSettings: { deadline: NOW - 1 } } as Partial<Statement>),
				5,
			],
		];

		describe.each(starts)('from %s', (_label, start, answerCount) => {
			it.each(STAGES)('stage %i', (stage) => {
				const statement = writeFields(start, applyStagePreset(start, stage));
				expect(getQuestionStage({ statement, answerCount, now: NOW })).toBe(stage);
			});
		});
	});

	it('Collecting stays Collecting with ratings on; ratings off does not pull Rating back', () => {
		const ratingsOn = writeFields(question(), applyStagePreset(question(), 0));
		expect(ratingsOn.statementSettings?.enableEvaluation).toBe(true);
		expect(getQuestionStage({ statement: ratingsOn, answerCount: 9, now: NOW })).toBe(0);

		const ratingStage = writeFields(question(), applyStagePreset(question(), 1));
		const switchedOff = writeFields(ratingStage, {
			'statementSettings.enableEvaluation': false,
		} as StagePresetFields);
		expect(getQuestionStage({ statement: switchedOff, answerCount: 9, now: NOW })).toBe(1);
	});
});

describe('differsFromStagePreset', () => {
	it.each(STAGES)('is false right after applying stage %i', (stage) => {
		const statement = writeFields(question(), applyStagePreset(question(), stage));
		expect(differsFromStagePreset(statement, stage)).toBe(false);
	});

	it.each([
		['add', 'enableAddEvaluationOption', false],
		['rate', 'enableEvaluation', false],
		['live', 'showEvaluation', true],
	] as const)('is true when the %s switch is flipped', (_name, key, value) => {
		const statement = writeFields(question(), applyStagePreset(question(), 1));
		const flipped = question({
			...statement,
			statementSettings: { ...statement.statementSettings, [key]: value },
		} as Partial<Statement>);
		expect(differsFromStagePreset(flipped, 1)).toBe(true);
	});

	it('reads the add flag of the voting UI on a voting question', () => {
		const statement = question({
			evaluationSettings: { evaluationUI: EvaluationUI.voting },
			statementSettings: { enableAddEvaluationOption: true, enableAddVotingOption: false },
		} as Partial<Statement>);
		expect(differsFromStagePreset(statement, 2)).toBe(false);
	});

	it('is true for an older question whose switches nobody set', () => {
		expect(differsFromStagePreset(question(), 1)).toBe(true);
	});
});
