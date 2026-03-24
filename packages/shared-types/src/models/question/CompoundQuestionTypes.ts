import {
	object,
	optional,
	string,
	number,
	boolean,
	array,
	enum_,
	InferOutput,
} from 'valibot';

export enum CompoundPhase {
	defineQuestion = 'define-question',
	subQuestions = 'sub-questions',
	findSolutions = 'find-solutions',
	resolution = 'resolution',
}

export const LockedTitleSchema = object({
	lockedText: string(),
	lockedBy: string(),
	lockedAt: number(),
});

export type LockedTitle = InferOutput<typeof LockedTitleSchema>;

export const SignDocumentLinkSchema = object({
	solutionId: string(),
	signDocumentId: string(),
	sentAt: number(),
	sentBy: string(),
});

export type SignDocumentLink = InferOutput<typeof SignDocumentLinkSchema>;

export const PhaseHistoryEntrySchema = object({
	from: enum_(CompoundPhase),
	to: enum_(CompoundPhase),
	changedBy: string(),
	changedAt: number(),
	reason: optional(string()),
});

export type PhaseHistoryEntry = InferOutput<typeof PhaseHistoryEntrySchema>;

export const CompoundSettingsSchema = object({
	currentPhase: enum_(CompoundPhase),
	questionScope: optional(string()),
	titleDiscussionId: optional(string()),
	lockedTitle: optional(LockedTitleSchema),
	lockedSubQuestionIds: optional(array(string())),
	solutionQuestionId: optional(string()),
	signDocumentIds: optional(array(SignDocumentLinkSchema)),
	mcSurveyId: optional(string()),
	phaseHistory: optional(array(PhaseHistoryEntrySchema)),
	subQuestionDiscussionId: optional(string()),
	promotedOptionIds: optional(array(string())),
});

export type CompoundSettings = InferOutput<typeof CompoundSettingsSchema>;

export const StatementLockedSchema = object({
	isLocked: boolean(),
	lockedBy: optional(string()),
	lockedAt: optional(number()),
	lockedText: optional(string()),
});

export type StatementLocked = InferOutput<typeof StatementLockedSchema>;
