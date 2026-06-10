import { object, string, optional, nullable, number, boolean, InferOutput, enum_ } from 'valibot';
import { QuestionType, StatementType } from '../TypeEnums';
import { NotificationTriggerType } from '../engagement/NotificationTriggerType';
import { SourceApp } from '../engagement/SourceApp';

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
	viewedInContext: optional(boolean()),

	// Cross-app notification metadata (backwards-compatible). The engagement
	// channel router already writes these onto inAppNotifications docs; making
	// them schema-valid removes the drift and lets a shared in-app center
	// label by origin and deep-link without per-app URL logic.
	triggerType: optional(enum_(NotificationTriggerType)),
	sourceApp: optional(enum_(SourceApp)),
	title: optional(string()),
	targetPath: optional(string()) // e.g. chat '/q/{id}', main app '/statement/{id}'
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