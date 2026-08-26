import { InferOutput, number, object, string, enum_, optional, nullable } from 'valibot';
import { Access } from '../TypeEnums';

/**
 * Consultant tenant ("organization") for the WizCol Studio console.
 *
 * An organization is an ACCOUNT, not a statement: it owns top-level questions
 * (`Statement.organizationId`) and a member roster. Org-admin authority on
 * those questions is materialized as `Role.admin` subscriptions by the
 * organization Cloud Functions, so the hot `/statements` rules path never has
 * to consult these collections.
 *
 * All three collections below are written exclusively by Cloud Functions
 * (Admin SDK). Clients only read.
 */

/**
 * Role of a member inside an organization.
 * `viewer` is reserved for a later phase — it is NOT grantable in v1.
 * Deliberately separate from Sign's `AdminPermissionLevel`.
 */
export enum OrganizationRole {
	owner = 'owner',
	admin = 'admin',
	viewer = 'viewer',
}

export enum OrganizationStatus {
	active = 'active',
	suspended = 'suspended',
}

export enum OrganizationInvitationStatus {
	pending = 'pending',
	accepted = 'accepted',
	expired = 'expired',
	revoked = 'revoked',
}

/** Stored at `organizations/{organizationId}`. */
export const OrganizationSchema = object({
	organizationId: string(),
	name: string(),
	slug: optional(string()),
	status: enum_(OrganizationStatus),
	createdBy: string(),
	createdAt: number(),
	lastUpdate: number(),
	/** Denormalized counters maintained by the organization functions. */
	memberCount: optional(number()),
	questionCount: optional(number()),
	/** Default `membership.access` applied to questions created under this org. */
	defaultAccess: optional(enum_(Access)),
	logoURL: optional(nullable(string())),
	/** ISO language code used for invitation emails and Studio defaults. */
	defaultLanguage: optional(string()),
});

export type Organization = InferOutput<typeof OrganizationSchema>;

/**
 * Active member record. One per (organization, user) pair.
 * Doc id format: `${organizationId}--${userId}` (see getOrganizationMemberId)
 * for deterministic O(1) lookup, mirroring `joinDelegates`.
 */
export const OrganizationMemberSchema = object({
	memberId: string(),
	organizationId: string(),
	userId: string(),
	email: string(),
	displayName: string(),
	role: enum_(OrganizationRole),
	addedAt: number(),
	addedBy: string(),
	lastUpdate: number(),
});

export type OrganizationMember = InferOutput<typeof OrganizationMemberSchema>;

/**
 * Pending invitation issued by an org owner/admin (or a system admin) to an
 * email address. Stored at `organizationInvitations/{invitationId}`.
 *
 * Unlike `JoinDelegateInvitation`, the raw token is never persisted: the
 * invite URL carries the secret and only its SHA-256 hash (`tokenHash`) is
 * stored, which is why the collection can be list-readable by any signed-in
 * user without leaking a usable credential.
 */
export const OrganizationInvitationSchema = object({
	invitationId: string(),
	organizationId: string(),
	organizationName: string(),
	invitedEmail: string(),
	invitedBy: string(),
	invitedByDisplayName: string(),
	role: enum_(OrganizationRole),
	tokenHash: string(),
	status: enum_(OrganizationInvitationStatus),
	createdAt: number(),
	expiresAt: number(),
	acceptedAt: optional(nullable(number())),
	acceptedByUserId: optional(nullable(string())),
});

export type OrganizationInvitation = InferOutput<typeof OrganizationInvitationSchema>;

/** Invite link expires after 7 days. Accepted membership is permanent until removed. */
export const ORG_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Roles that may administer an organization (create questions, invite members). */
export const ORG_ADMIN_ROLES: readonly OrganizationRole[] = [
	OrganizationRole.owner,
	OrganizationRole.admin,
];

/** Build the deterministic doc id for an organization-member record. */
export function getOrganizationMemberId(organizationId: string, userId: string): string {
	return `${organizationId}--${userId}`;
}
