import { object, optional, enum_, InferOutput, array, boolean, number } from 'valibot';
import {
	QuestionStage,
	QuestionStagesType,
	QuestionStep,
	QuestionType,
} from '../TypeEnums';
import { CompoundSettingsSchema } from './CompoundQuestionTypes';

export const QuestionSettingsSchema = object({
	isTopQuestion: optional(boolean()), //used to find the top question and all here descendants.
	questionType: optional(enum_(QuestionType)), // multi-stage, mass-consensus, compound
	askUserForASolutionBeforeEvaluation: optional(boolean()), // if true, ask the user for a solution before evaluation
	steps: optional(enum_(QuestionStagesType)),
	stepsAllowed: optional(array(enum_(QuestionStep))),
	currentStep: optional(enum_(QuestionStep)),
	currentStage: optional(enum_(QuestionStage)), //deprecated
	compoundSettings: optional(CompoundSettingsSchema), // compound question phase tracking
	deadline: optional(number()), // absolute timestamp in ms when the timer expires
	durationMs: optional(number()), // original duration in ms (for display)
	pausedAt: optional(number()), // timestamp when the timer was paused (if set, timer is paused)
	remainingMsAtPause: optional(number()), // remaining ms when paused; used to compute new deadline on resume
});

export type QuestionSettings = InferOutput<typeof QuestionSettingsSchema>;
