import {
	type InferOutput,
	array,
	enum_,
	number,
	object,
	optional,
	string,
} from 'valibot';
import { NotificationTriggerType } from './NotificationTriggerType';
import { SourceApp } from './SourceApp';

export const DigestItemSchema = object({
	triggerType: enum_(NotificationTriggerType),
	sourceApp: enum_(SourceApp),
	title: string(),
	body: string(),
	targetPath: string(),
	statementId: optional(string()),
	createdAt: number(),
});

export type DigestItem = InferOutput<typeof DigestItemSchema>;

export const DigestContentSchema = object({
	userId: string(),
	items: array(DigestItemSchema),
	periodStart: number(),
	periodEnd: number(),
	totalNewStatements: number(),
	totalNewEvaluations: number(),
	creditsEarned: number(),
	createdAt: number(),
});

export type DigestContent = InferOutput<typeof DigestContentSchema>;
