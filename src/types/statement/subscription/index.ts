import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	InferInput,
	enum_,
} from 'valibot';
import { Role, UserSchema } from '../../user';
import { StatementSchema } from '..';

export const StatementSubscriptionSchema = object({
	role: enum_(Role),
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
