import {
	object,
	string,
	number,
	optional,
	array,
	enum_,
	record,
	InferOutput,
	boolean,
} from 'valibot';
import { Creator, CreatorSchema, User, UserSchema } from '../user/User';
import { Role } from '../user/UserSettings';
import { StatementType } from '../TypeEnums';
import { NotificationFrequency } from '../engagement/NotificationFrequency';
import { BranchPreferenceSchema } from '../engagement/EngagementModel';
import { StatementSchema } from './StatementTypes';
import { SimpleStatementSchema } from './SimpleStatement';

export const StatementSubscriptionSchema = object({
	role: enum_(Role),
	userId: string(),
	statementId: string(),
	lastUpdate: number(),
	createdAt: optional(number()),
	statementsSubscribeId: string(),
	statement: SimpleStatementSchema || StatementSchema,
	lastSubStatements:optional(array(SimpleStatementSchema || StatementSchema)),

	// Top-level query fields (promoted from embedded statement for efficient Firestore queries)
	// These are immutable after creation — set once when subscription is created
	parentId: optional(string()),
	statementType: optional(enum_(StatementType)),
	topParentId: optional(string()),
	tokens: optional(array(string())),
	totalSubStatementsRead: optional(number()), // deprecated at 3/8/2024
	lastReadTimestamp: optional(number()),
	user: UserSchema || CreatorSchema,
	getInAppNotification: optional(boolean()),
	getEmailNotification: optional(boolean()),
	getPushNotification: optional(boolean()),
	coins: optional(number()), // In fair-Division, the coins the user has in this statement
	isDocument: optional(boolean()), // Marks this subscription as a Sign document for home page display
	isBookmarked: optional(boolean()), // User bookmark for quick access filtering

	// Engagement system extensions (backwards-compatible)
	notificationFrequency: optional(enum_(NotificationFrequency)), // Default frequency for this discussion
	branchPreferences: optional(record(string(), BranchPreferenceSchema)), // Per-branch overrides keyed by branchStatementId
});
 
export type StatementSubscription = InferOutput<
	typeof StatementSubscriptionSchema
>;

export function getStatementSubscriptionId(
	statementId: string,
	user: User | Creator
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

export const WaitingMemberSchema = object({
	// Spread all properties from the original schema
	...StatementSubscriptionSchema.entries,

	// Add your new property
	adminId: string(), // or any other valibot validator
});

export type WaitingMember = InferOutput<
	typeof WaitingMemberSchema
> 