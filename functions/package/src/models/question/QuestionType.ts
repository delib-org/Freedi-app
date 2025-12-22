import { object, optional, enum_, InferOutput, array, boolean } from 'valibot';
import {
	QuestionStage,
	QuestionStagesType,
	QuestionStep,
	QuestionType,
} from '../TypeEnums';

export const QuestionSettingsSchema = object({
	isTopQuestion: optional(boolean()), //used to find the top question and all here descendants.
	questionType: optional(enum_(QuestionType)), // multi-stage, mass-consensus
	askUserForASolutionBeforeEvaluation: optional(boolean()), // if true, ask the user for a solution before evaluation
	steps: optional(enum_(QuestionStagesType)),
	stepsAllowed: optional(array(enum_(QuestionStep))),
	currentStep: optional(enum_(QuestionStep)),
	currentStage: optional(enum_(QuestionStage)), //deprecated
});

export type QuestionSettings = InferOutput<typeof QuestionSettingsSchema>;
