import { object, boolean, optional, enum_, InferOutput } from 'valibot';

export enum QuestionType {
	singleStep = 'single-step',
	multipleSteps = 'multiple-steps',
}

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
}

export const QuestionSettingsSchema = object({
	isDocument: optional(boolean()),
	questionType: optional(enum_(QuestionType)),
	steps: optional(enum_(QuestionStagesType)),
	currentStage: optional(enum_(QuestionStage)),
});

export type QuestionSettings = InferOutput<typeof QuestionSettingsSchema>;
