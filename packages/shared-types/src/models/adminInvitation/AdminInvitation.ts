import { InferOutput, number, object, string, enum_, optional, nullable, boolean } from 'valibot';

/**
 * Permission levels for document admins
 */
export enum AdminPermissionLevel {
	/** Document creator - full control including delete and transfer ownership */
	owner = 'owner',
	/** Can manage settings, users, invite viewers but cannot delete document or remove owner */
	admin = 'admin',
	/** Can view all analytics but cannot change settings */
	viewer = 'viewer',
}

/**
 * Status of an admin invitation
 */
export enum AdminInvitationStatus {
	pending = 'pending',
	accepted = 'accepted',
	expired = 'expired',
	revoked = 'revoked',
}

/**
 * Admin invitation schema - for email-verified invitations
 * Used when inviting someone with a specific email to become an admin
 */
export const AdminInvitationSchema = object({
	invitationId: string(),
	documentId: string(),
	invitedEmail: string(),
	invitedBy: string(),
	invitedByDisplayName: string(),
	permissionLevel: enum_(AdminPermissionLevel),
	token: string(),
	status: enum_(AdminInvitationStatus),
	createdAt: number(),
	expiresAt: number(),
	acceptedAt: optional(nullable(number())),
	acceptedByUserId: optional(nullable(string())),
	acceptedByDisplayName: optional(nullable(string())),
});

export type AdminInvitation = InferOutput<typeof AdminInvitationSchema>;

/**
 * Viewer link schema - shareable link for analytics access
 * No email verification required, anyone with the link can view
 */
export const ViewerLinkSchema = object({
	linkId: string(),
	documentId: string(),
	createdBy: string(),
	createdByDisplayName: string(),
	token: string(),
	expiresAt: number(),
	isActive: boolean(),
	createdAt: number(),
	label: optional(nullable(string())),
});

export type ViewerLink = InferOutput<typeof ViewerLinkSchema>;

/**
 * Document collaborator schema - accepted admins with permissions
 * Stored in subcollection: documentCollaborators/{documentId}/collaborators/{userId}
 */
export const DocumentCollaboratorSchema = object({
	documentId: string(),
	userId: string(),
	email: string(),
	displayName: string(),
	permissionLevel: enum_(AdminPermissionLevel),
	addedAt: number(),
	addedBy: string(),
	lastUpdate: number(),
});

export type DocumentCollaborator = InferOutput<typeof DocumentCollaboratorSchema>;

/**
 * Helper function to check if user has required permission level
 * Permission hierarchy: owner > admin > viewer
 */
export function hasPermissionLevel(
	userLevel: AdminPermissionLevel,
	requiredLevel: AdminPermissionLevel
): boolean {
	const levels: Record<AdminPermissionLevel, number> = {
		[AdminPermissionLevel.owner]: 3,
		[AdminPermissionLevel.admin]: 2,
		[AdminPermissionLevel.viewer]: 1,
	};

	return levels[userLevel] >= levels[requiredLevel];
}

/**
 * Default expiry durations in milliseconds
 */
export const INVITATION_EXPIRY = {
	/** Admin invitation expires after 7 days */
	ADMIN_INVITATION: 7 * 24 * 60 * 60 * 1000,
	/** Viewer link options */
	VIEWER_LINK: {
		ONE_DAY: 1 * 24 * 60 * 60 * 1000,
		SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
		THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,
	},
} as const;
