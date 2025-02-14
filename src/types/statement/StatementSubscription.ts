import {
	object,
	string,
	number,
	optional,
	array,
	enum_,
	InferOutput,
} from 'valibot';
import { User, UserSchema } from '../user/User';
import { StatementSchema } from './Statement';
import { Role } from '../user/UserSettings';

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
