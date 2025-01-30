import { object, string, number, InferOutput, optional } from 'valibot';

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
