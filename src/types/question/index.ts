import { object, optional, enum_, InferOutput, array } from 'valibot';
import { QuestionType } from '../enums';

export enum QuestionStagesType {
	singleStage = 'singleStage',
	document = 'document',
}
export enum QuestionStage {
	explanation = 'explanation',
	suggestion = 'suggestion',
	firstEvaluation = 'firstEvaluation',
	secondEvaluation = 'secondEvaluation',
	voting = 'voting',
	finished = 'finished',
	other = 'other',
}

export enum QuestionStep {
	explanation = 'explanation',
	suggestion = 'suggestion',
	randomEvaluation = 'random-evaluation',
	topEvaluation = 'top-evaluation',
	voting = 'voting',
	finished = 'finished',
	other = 'other',
}

export const QuestionSettingsSchema = object({
	questionType: optional(enum_(QuestionType)), //deprecated
	steps: optional(enum_(QuestionStagesType)),
	stepsAllowed: optional(array(enum_(QuestionStep))),
	stages: optional(array(enum_(QuestionStage))),
	currentStep: optional(enum_(QuestionStep)),
	currentStage: optional(enum_(QuestionStage)), //deprecated
});

export type QuestionSettings = InferOutput<typeof QuestionSettingsSchema>;
