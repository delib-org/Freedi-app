import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { randomBytes } from 'crypto';
import {
	Collections,
	ORG_INVITE_EXPIRY_MS,
	OrganizationInvitation,
	OrganizationInvitationStatus,
	OrganizationRole,
} from '@freedi/shared-types';
import { db } from '../db';
import { getStudioBaseUrl, hashToken } from './orgAuth';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roles an invitation may grant in v1 (`viewer` is reserved). */
export const INVITABLE_ROLES: readonly OrganizationRole[] = [
	OrganizationRole.admin,
	OrganizationRole.owner,
];

export interface CallerIdentity {
	uid: string;
	email: string | null;
	displayName: string;
}

/** Normalizes a raw email input; throws `invalid-argument` when malformed. */
export function normalizeEmailOrThrow(email: unknown): string {
	const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!normalized || !EMAIL_REGEX.test(normalized)) {
		throw new HttpsError('invalid-argument', 'A valid email is required');
	}

	return normalized;
}

/** uid / email / display name from the callable auth token. */
export function getCallerIdentity(request: CallableRequest<unknown>): CallerIdentity {
	const uid = request.auth?.uid;
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}
	const token = request.auth?.token as { email?: string; name?: string } | undefined;
	const email = token?.email?.trim().toLowerCase() || null;
	const displayName = token?.name?.trim() || email || 'A WizCol Studio admin';

	return { uid, email, displayName };
}

export function buildInviteLink(rawToken: string): string {
	return `${getStudioBaseUrl()}/invite?token=${encodeURIComponent(rawToken)}`;
}

/** Fresh 256-bit URL-safe token plus its stored hash and expiry. */
export function mintInviteToken(now: number): {
	rawToken: string;
	tokenHash: string;
	expiresAt: number;
} {
	const rawToken = randomBytes(32).toString('base64url');

	return { rawToken, tokenHash: hashToken(rawToken), expiresAt: now + ORG_INVITE_EXPIRY_MS };
}

export interface BuildInvitationInput {
	organizationId: string;
	organizationName: string;
	invitedEmail: string;
	role: OrganizationRole;
	inviter: CallerIdentity;
	now: number;
}

export interface BuiltInvitation {
	invitation: OrganizationInvitation;
	rawToken: string;
	inviteLink: string;
}

/**
 * Builds a pending invitation document (hash only — the raw token lives in the
 * returned link and is never persisted). The caller decides how to write it
 * (plain set or as part of a batch).
 */
export function buildInvitation(input: BuildInvitationInput): BuiltInvitation {
	const { rawToken, tokenHash, expiresAt } = mintInviteToken(input.now);
	const invitationRef = db.collection(Collections.organizationInvitations).doc();

	const invitation: OrganizationInvitation = {
		invitationId: invitationRef.id,
		organizationId: input.organizationId,
		organizationName: input.organizationName,
		invitedEmail: input.invitedEmail,
		invitedBy: input.inviter.uid,
		invitedByDisplayName: input.inviter.displayName,
		role: input.role,
		tokenHash,
		status: OrganizationInvitationStatus.pending,
		createdAt: input.now,
		expiresAt,
		acceptedAt: null,
		acceptedByUserId: null,
	};

	return { invitation, rawToken, inviteLink: buildInviteLink(rawToken) };
}
