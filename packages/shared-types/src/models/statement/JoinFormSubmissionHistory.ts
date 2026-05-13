import {
	object,
	string,
	number,
	optional,
	record,
	picklist,
	array,
	any,
	InferOutput,
} from 'valibot';

/**
 * JoinFormSubmissionHistoryEntry — an immutable, durable snapshot of one
 * write to a `joinFormSubmissions/{userId}` doc. Written by the backup
 * trigger on every create / update / delete of a submission. The hot
 * `joinFormSubmissions` doc is mutable and may be wiped by `resetQuestionJoining`;
 * this collection is the durable record we restore from.
 *
 * Stored at:
 *   joinFormSubmissionsHistory/{questionId}_{userId}_{capturedAtMs}
 *
 * Doc id is deterministic (one per write event). All entries auto-delete
 * after the retention window via Firestore TTL on `expireAt`.
 *
 * Default-deny in firestore.rules — Admin SDK only.
 */

export const JoinFormSubmissionHistoryOperationSchema = picklist([
	'create',
	'update',
	'delete',
]);
export type JoinFormSubmissionHistoryOperation = InferOutput<
	typeof JoinFormSubmissionHistoryOperationSchema
>;

export const JoinFormSubmissionHistoryRoleSchema = picklist(['activist', 'organizer']);
export type JoinFormSubmissionHistoryRole = InferOutput<
	typeof JoinFormSubmissionHistoryRoleSchema
>;

export const JoinFormSubmissionHistoryRetentionSchema = picklist([
	'standard',
	'gdpr-erasure-pending',
]);
export type JoinFormSubmissionHistoryRetention = InferOutput<
	typeof JoinFormSubmissionHistoryRetentionSchema
>;

export const JoinFormMembershipSnapshotSchema = object({
	activistOptions: array(string()), // option ids the user is in joined[]
	organizerOptions: array(string()), // option ids the user is in organizers[]
});
export type JoinFormMembershipSnapshot = InferOutput<typeof JoinFormMembershipSnapshotSchema>;

export const JoinFormSubmissionHistoryEntrySchema = object({
	historyId: string(), // {questionId}_{userId}_{capturedAtMs}
	questionId: string(),
	userId: string(),

	operation: JoinFormSubmissionHistoryOperationSchema,
	capturedAt: number(), // ms epoch
	capturedByTrigger: string(),

	// Full snapshot — never stripped except by the GDPR erasure callable.
	displayName: string(),
	values: record(string(), string()),
	role: optional(string()), // store as raw string so a future role addition doesn't fail the schema

	// What was their membership at capture time? Lets a restore reconstruct
	// sheet rows + cross-check.
	membershipSnapshot: optional(JoinFormMembershipSnapshotSchema),

	retentionPolicy: JoinFormSubmissionHistoryRetentionSchema,

	// Replaced with `{ redactedAt: ms }` by the erasure callable. Stored as
	// `any` because the schema must round-trip both the original `values`
	// shape and the post-erasure marker — the Firestore rule guarantees no
	// client touches it.
	redactedAt: optional(number()),

	// expireAt is a native Firestore Timestamp (TTL requirement). Modeled
	// as `any` here since shared-types doesn't depend on firebase-admin.
	expireAt: any(),
});

export type JoinFormSubmissionHistoryEntry = InferOutput<
	typeof JoinFormSubmissionHistoryEntrySchema
>;

export const JOIN_FORM_SUBMISSIONS_HISTORY_COLLECTION = 'joinFormSubmissionsHistory';

/** Build the deterministic doc id for a history entry. */
export function getJoinFormSubmissionHistoryId(
	questionId: string,
	userId: string,
	capturedAtMs: number,
): string {
	return `${questionId}_${userId}_${capturedAtMs}`;
}

/** Days the hot tier retains entries before TTL deletion. */
export const JOIN_FORM_SUBMISSIONS_HISTORY_RETENTION_DAYS = 90;
