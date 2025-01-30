import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	enum_,
	InferOutput,
} from 'valibot';
import { Role, User, UserSchema } from '../../user';
import { StatementSchema } from '..';

export const StatementSubscriptionSchema = object({
	role: enum_(Role),
	userId: string(),
	statementId: string(),
	lastUpdate: number(),
	createdAt: optional(number()),
	statementsSubscribeId: string(),
	statement: StatementSchema,
	token: optional(array(string())),
	totalSubStatementsRead: optional(number()),
	user: UserSchema,
});

export type StatementSubscription = InferOutput<
	typeof StatementSubscriptionSchema
>;

export const StatementSubscriptionNotificationSchema = object({
	statementId: string(),
	userId: string(),
	subscribed: boolean(),
	token: string(),
	notification: optional(boolean()),
});

export function getStatementSubscriptionId(
	statementId: string,
	user: User
): string | undefined {
	return `${user.uid}--${statementId}`;
}

export const StatementViewSchema = object({
	statementId: string(),
	userId: string(),
	viewed: number(),
	lastViewed: number(),
	parentDocumentId: string(),
});

export type StatementView = InferOutput<typeof StatementViewSchema>;
