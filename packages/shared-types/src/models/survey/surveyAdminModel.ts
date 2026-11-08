import {
  object,
  string,
  number,
  nullable,
  enum_,
  InferOutput,
} from 'valibot';

// ============================================
// Survey Admin Role
// ============================================
/**
 * What an invited co-admin may do on a survey. The survey's `creatorId` is the
 * owner and is never represented here — ownership is implicit and cannot be
 * granted, transferred or revoked through the admin list.
 */
export enum SurveyAdminRole {
  /** Sees every admin screen the owner sees, but cannot change anything. */
  viewer = 'admin-viewer',
  /** Sees and edits the survey exactly like the owner, except the admin list. */
  editor = 'admin-edit',
}

export const SurveyAdminRoleSchema = enum_(SurveyAdminRole);

/** Roles an invitation may grant. Ownership is not invitable. */
export const INVITABLE_SURVEY_ADMIN_ROLES: readonly SurveyAdminRole[] = [
  SurveyAdminRole.viewer,
  SurveyAdminRole.editor,
];

/** True when the role carries write access to the survey. */
export function canEditSurvey(role: SurveyAdminRole): boolean {
  return role === SurveyAdminRole.editor;
}

// ============================================
// Survey Admin (an accepted co-admin)
// ============================================
export const SurveyAdminSchema = object({
  /** Format: `${surveyId}--${userId}` */
  surveyAdminId: string(),
  surveyId: string(),
  userId: string(),
  /** Lowercased email the invite was sent to, kept for display and re-invites. */
  email: string(),
  displayName: string(),
  role: SurveyAdminRoleSchema,
  /** uid of the survey owner who granted the access. */
  addedBy: string(),
  addedAt: number(),
  lastUpdate: number(),
});

export type SurveyAdmin = InferOutput<typeof SurveyAdminSchema>;

/** Deterministic document id for a survey-admin record. */
export function getSurveyAdminId(surveyId: string, userId: string): string {
  return `${surveyId}--${userId}`;
}

// ============================================
// Survey Admin Invitation
// ============================================
export enum SurveyAdminInvitationStatus {
  pending = 'pending',
  accepted = 'accepted',
  revoked = 'revoked',
  expired = 'expired',
}

export const SurveyAdminInvitationStatusSchema = enum_(SurveyAdminInvitationStatus);

/** How long an emailed invite link stays usable. */
export const SURVEY_ADMIN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Cap on live pending invites per survey, to blunt email-spam abuse. */
export const MAX_PENDING_SURVEY_ADMIN_INVITES = 20;

export const SurveyAdminInvitationSchema = object({
  invitationId: string(),
  surveyId: string(),
  /** Denormalized so the invite email and accept screen need no survey read. */
  surveyTitle: string(),
  /** Lowercased, trimmed. */
  invitedEmail: string(),
  invitedBy: string(),
  invitedByDisplayName: string(),
  role: SurveyAdminRoleSchema,
  /**
   * SHA-256 of the raw link token. The raw token exists only in the emailed
   * link and in the response to the callable that minted it — never at rest.
   */
  tokenHash: string(),
  status: SurveyAdminInvitationStatusSchema,
  createdAt: number(),
  expiresAt: number(),
  acceptedAt: nullable(number()),
  acceptedByUserId: nullable(string()),
});

export type SurveyAdminInvitation = InferOutput<typeof SurveyAdminInvitationSchema>;

// ============================================
// Resolved access level
// ============================================
/**
 * The access a given user holds on a survey. `owner` is the `creatorId`;
 * `editor`/`viewer` come from a `surveyAdmins` record; `null` means no access.
 */
export type SurveyAccessLevel = 'owner' | 'editor' | 'viewer';

export interface SurveyAccess {
  level: SurveyAccessLevel;
  /** True for `owner` and `editor` — may mutate the survey. */
  canEdit: boolean;
  /** True for `owner` only — may manage the admin list. */
  canManageAdmins: boolean;
}

/** Builds the access flags for a resolved level. Single source of truth. */
export function buildSurveyAccess(level: SurveyAccessLevel): SurveyAccess {
  return {
    level,
    canEdit: level === 'owner' || level === 'editor',
    canManageAdmins: level === 'owner',
  };
}
