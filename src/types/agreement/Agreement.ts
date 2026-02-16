import { object, string, number, InferOutput, optional, InferInput, boolean } from 'valibot';

export const TermsOfUseAcceptanceSchema = object({
	text: string(),
	date: number(),
	version: string(),
	userId: string(),
	accepted: boolean(),
});

export type TermsOfUseAcceptance = InferInput<typeof TermsOfUseAcceptanceSchema>;

export enum AgreeDisagreeEnum {
	Agree = 'agree',
	Disagree = 'disagree',
	NoOpinion = 'noOpinion',
}

export const AgreeDisagreeSchema = object({
	agreeId: string(),
	statementId: string(),
	documentId: string(),
	topParentId: string(),
	userId: string(),
	agree: number(),
});

export type AgreeDisagree = InferOutput<typeof AgreeDisagreeSchema>;

export const AgreeSchema = object({
	agree: optional(number()),
	disagree: optional(number()),
	avgAgree: optional(number()),
});

export type Agree = InferOutput<typeof AgreeSchema>;

export const ImportanceSchema = object({
	topParentId: string(),
	documentId: string(),
	parentId: string(),
	statementId: string(),
	importance: number(),
	userId: string(),
});

export type Importance = InferOutput<typeof ImportanceSchema>;

export const DocumentApprovalSchema = object({
	approved: number(),
	totalVoters: number(),
	averageApproval: number(),
});

export type DocumentApproval = InferInput<typeof DocumentApprovalSchema>;

export const DocumentImportanceSchema = object({
	numberOfUsers: number(),
	averageImportance: number(),
	sumImportance: number(),
});

export type DocumentImportance = InferInput<typeof DocumentImportanceSchema>;
