import { EvaluationUI, QuestionStep, Statement, StatementType } from '@freedi/shared-types';

/**
 * The four stages the question screen shows (אוספים · מדרגים · מצביעים · הוחלט).
 * The data model has a finer `QuestionStep`; this file folds it into the four
 * segments of the stage bar, and derives a stage when a host never set one.
 */

export const QUESTION_STAGES = ['collecting', 'rating', 'voting', 'decided'] as const;
export type QuestionStageId = (typeof QUESTION_STAGES)[number];
export type QuestionStageIndex = 0 | 1 | 2 | 3;

export const STAGE_COLLECTING: QuestionStageIndex = 0;
export const STAGE_RATING: QuestionStageIndex = 1;
export const STAGE_VOTING: QuestionStageIndex = 2;
export const STAGE_DECIDED: QuestionStageIndex = 3;

/** English i18n keys for the stage labels, in bar order. */
export const STAGE_LABEL_KEYS: readonly string[] = [
	'stage.collecting',
	'stage.rating',
	'stage.voting',
	'stage.decided',
];

/** The step a host's stage pick writes to `questionSettings.currentStep`. */
export const STAGE_TO_STEP: Readonly<Record<QuestionStageIndex, QuestionStep>> = {
	0: QuestionStep.suggestion,
	1: QuestionStep.randomEvaluation,
	2: QuestionStep.voting,
	3: QuestionStep.finished,
};

/** Stage for an explicit step, or undefined when the step says nothing about the stage. */
export function stageFromStep(step: QuestionStep | undefined): QuestionStageIndex | undefined {
	switch (step) {
		case QuestionStep.explanation:
		case QuestionStep.suggestion:
			return STAGE_COLLECTING;
		case QuestionStep.randomEvaluation:
		case QuestionStep.topEvaluation:
			return STAGE_RATING;
		case QuestionStep.voting:
			return STAGE_VOTING;
		case QuestionStep.finished:
			return STAGE_DECIDED;
		default:
			return undefined;
	}
}

export interface StageInput {
	statement: Statement | undefined;
	/** Answers currently under the question (drives "collecting" when there are none). */
	answerCount: number;
	/** Injected clock, so the deadline rule is testable. */
	now: number;
}

/**
 * Which of the four stages a question is in.
 *
 * 1. An explicit `questionSettings.currentStep` wins (explanation/suggestion →
 *    collecting, random/top evaluation → rating, voting → voting, finished →
 *    decided).
 * 2. Otherwise (missing or `other`), derive it from what the question does:
 *    - its own deadline has passed → decided;
 *    - it runs the voting UI → voting;
 *    - ratings are switched off, or no answer exists yet → collecting;
 *    - anything else → rating (answers exist and can be rated).
 */
export function getQuestionStage({ statement, answerCount, now }: StageInput): QuestionStageIndex {
	const explicit = stageFromStep(statement?.questionSettings?.currentStep);
	if (explicit !== undefined) return explicit;

	const deadline = statement?.questionSettings?.deadline;
	if (typeof deadline === 'number' && deadline > 0 && deadline <= now) return STAGE_DECIDED;
	if (statement?.evaluationSettings?.evaluationUI === EvaluationUI.voting) return STAGE_VOTING;
	if (statement?.statementSettings?.enableEvaluation === false) return STAGE_COLLECTING;
	if (answerCount === 0) return STAGE_COLLECTING;

	return STAGE_RATING;
}

/** The stage bar belongs to questions only — spaces, chats and answers have no process. */
export function showsStageBar(statement: Statement | undefined): boolean {
	return statement?.statementType === StatementType.question;
}

export type StageSegmentState = 'done' | 'active' | 'future';

export function segmentState(index: number, active: QuestionStageIndex): StageSegmentState {
	if (index < active) return 'done';
	if (index === active) return 'active';

	return 'future';
}
