import { InferOutput, number, object, string, enum_, optional, nullable, boolean } from 'valibot';

/**
 * Permissions a join-app delegate is granted on a specific question.
 *
 * The two booleans are independent: each grants full add + edit + delete
 * authority on solutions of that category, where category is decided by the
 * `creatorRole` field on the option Statement (admin = organizer's, anything
 * else = participant's).
 */
export const JoinDelegatePermissionsSchema = object({
	canManageOrganizerSolutions: boolean(),
	canManageParticipantSolutions: boolean(),
});

export type JoinDelegatePermissions = InferOutput<typeof JoinDelegatePermissionsSchema>;

export enum JoinDelegateInvitationStatus {
	pending = 'pending',
	accepted = 'accepted',
	expired = 'expired',
	revoked = 'revoked',
}

/**
 * Pending invitation issued by a question admin to a trusted user's email.
 * Stored at `joinDelegateInvitations/{invitationId}`. The token is the secret
 * shared via the invite URL (`/invite?token=...`).
 */
export const JoinDelegateInvitationSchema = object({
	invitationId: string(),
	questionId: string(),
	invitedEmail: string(),
	invitedBy: string(),
	invitedByDisplayName: string(),
	permissions: JoinDelegatePermissionsSchema,
	token: string(),
	status: enum_(JoinDelegateInvitationStatus),
	createdAt: number(),
	expiresAt: number(),
	acceptedAt: optional(nullable(number())),
	acceptedByUserId: optional(nullable(string())),
});

export type JoinDelegateInvitation = InferOutput<typeof JoinDelegateInvitationSchema>;

/**
 * Active delegate record. One per (question, user) pair.
 * Doc id format: `${questionId}--${userId}` for deterministic O(1) lookup
 * (mirrors the `statementsSubscribe` `${userId}--${questionId}` convention).
 */
export const JoinDelegateSchema = object({
	delegateId: string(),
	questionId: string(),
	userId: string(),
	email: string(),
	displayName: string(),
	permissions: JoinDelegatePermissionsSchema,
	addedAt: number(),
	addedBy: string(),
	lastUpdate: number(),
});

export type JoinDelegate = InferOutput<typeof JoinDelegateSchema>;

/** Invite link expires after 7 days. Accepted access is permanent until revoked. */
export const JOIN_DELEGATE_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Build the deterministic doc id for a join-delegate record. */
export function getJoinDelegateId(questionId: string, userId: string): string {
	return `${questionId}--${userId}`;
}
