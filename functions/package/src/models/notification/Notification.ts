import { object, string, optional, nullable, number, boolean, InferOutput, enum_ } from 'valibot';
import { QuestionType, StatementType } from '../TypeEnums';

export const NotificationSchema = object({
	userId: string(),
	parentId: string(),
	statementId: string(),
	statementType: enum_(StatementType),
	parentStatement: optional(string()),
	questionType: optional(enum_(QuestionType)),
	text: string(),
	creatorId: string(),
	creatorName: string(),
	creatorImage: optional(nullable(string())),
	createdAt: number(),
	read: boolean(),
	notificationId: string(),
	readAt: optional(number()),
	viewedInList: optional(boolean()),
	viewedInContext: optional(boolean())
});

export type NotificationType = InferOutput<typeof NotificationSchema>;

export enum ReadContext {
	LIST = 'list',
	CHAT = 'chat',
	STATEMENT = 'statement'
};

export const NotificationReadStatusSchema = object({
	userId: string(),
	notificationId: string(),
	statementId: string(),
	readAt: number(),
	readContext: enum_(ReadContext)
});

export type NotificationReadStatusType = InferOutput<typeof NotificationReadStatusSchema>;