import {
	type InferOutput,
	array,
	boolean,
	enum_,
	nullable,
	number,
	object,
	optional,
	string,
} from 'valibot';
import { NotificationChannel } from './NotificationChannel';
import { NotificationFrequency } from './NotificationFrequency';
import { NotificationTriggerType } from './NotificationTriggerType';
import { SourceApp } from './SourceApp';

export enum NotificationQueueStatus {
	PENDING = 'pending',
	PROCESSING = 'processing',
	SENT = 'sent',
	FAILED = 'failed',
	SKIPPED = 'skipped',
}

export const NotificationQueueItemSchema = object({
	queueItemId: string(),
	userId: string(),

	// Content
	title: string(),
	body: string(),
	imageUrl: optional(string()),

	// Routing
	channels: array(enum_(NotificationChannel)),
	sourceApp: enum_(SourceApp),
	targetPath: string(),

	// Scheduling
	deliverAt: nullable(number()),
	frequency: enum_(NotificationFrequency),

	// Context
	triggerType: enum_(NotificationTriggerType),
	statementId: optional(string()),
	parentId: optional(string()),
	topParentId: optional(string()),

	// State
	status: enum_(NotificationQueueStatus),
	processedAt: optional(number()),
	error: optional(string()),
	retryCount: optional(number()),
	createdAt: number(),
});

export type NotificationQueueItem = InferOutput<
	typeof NotificationQueueItemSchema
>;
