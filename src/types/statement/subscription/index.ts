import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	InferInput,
} from 'valibot';
import { UserSchema } from '../../user';
import { StatementSchema } from '..';

export const StatementSubscriptionSchema = object({
	role: string(), // Simplified from enum
	userId: string(),
	statementId: string(),
	lastUpdate: number(),
	createdAt: optional(number()),
	statementsSubscribeId: string(),
	statement: StatementSchema,
	notification: boolean(),
	token: optional(array(string())),
	totalSubStatementsRead: optional(number()),
	user: UserSchema,
	userAskedForNotification: boolean(),
});

export type StatementSubscription = InferInput<
	typeof StatementSubscriptionSchema
>;

export const StatementSubscriptionNotificationSchema = object({
	statementId: string(),
	userId: string(),
	subscribed: boolean(),
	token: string(),
	notification: optional(boolean()),
});
