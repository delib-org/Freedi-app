import { object, optional, enum_, InferOutput, array } from 'valibot';
import {
	QuestionStage,
	QuestionStagesType,
	QuestionStep,
	QuestionType,
} from '../TypeEnums';

export const QuestionSettingsSchema = object({
	questionType: optional(enum_(QuestionType)), //deprecated
	steps: optional(enum_(QuestionStagesType)),
	stepsAllowed: optional(array(enum_(QuestionStep))),
	stages: optional(array(enum_(QuestionStage))),
	currentStep: optional(enum_(QuestionStep)),
	currentStage: optional(enum_(QuestionStage)), //deprecated
});

export type QuestionSettings = InferOutput<typeof QuestionSettingsSchema>;
