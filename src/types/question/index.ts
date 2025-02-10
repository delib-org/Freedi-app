import { object, string, optional, nullable, number, boolean } from 'valibot';

export const NotificationSchema = object({
	userId: string(),
	parentId: string(),
	parentStatement: optional(string()),
	text: string(),
	creatorName: string(),
	creatorImage: optional(nullable(string())),
	createdAt: number(),
	read: boolean(),
	notificationId: string(),
});