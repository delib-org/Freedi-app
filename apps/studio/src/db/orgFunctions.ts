import { httpsCallable } from 'firebase/functions';
import type { Access, QuestionStatus } from '@freedi/shared-types';
import { OrganizationRole } from '@freedi/shared-types';
import { functions } from '@/firebase';

/**
 * Typed `httpsCallable` wrappers for the organization / progress Cloud
 * Functions (all in me-west1 — see `@/firebase`). Request and result shapes
 * mirror the interfaces declared next to each function in `functions/src`.
 */

// --- Organizations ---------------------------------------------------------

export interface CreateOrganizationRequest {
	name: string;
	ownerEmail: string;
	defaultAccess?: Access;
	defaultLanguage?: string;
}

export interface CreateOrganizationResult {
	organizationId: string;
	invitationId?: string;
	inviteLink?: string;
}

/** Roles a facilitator can grant through the console (viewer is reserved). */
export type GrantableOrgRole = OrganizationRole.admin | OrganizationRole.owner;

export interface InviteOrgMemberRequest {
	organizationId: string;
	email: string;
	role: GrantableOrgRole;
}

export interface InviteOrgMemberResult {
	invitationId: string;
	inviteLink: string;
}

export interface ResendOrgInviteRequest {
	invitationId: string;
}

export interface ResendOrgInviteResult {
	invitationId: string;
	inviteLink: string;
	expiresAt: number;
}

export interface RevokeOrgInviteRequest {
	invitationId: string;
}

export interface RevokeOrgInviteResult {
	invitationId: string;
	status: string;
}

export interface AcceptOrgInviteRequest {
	token: string;
}

export interface AcceptOrgInviteResult {
	organizationId: string;
	organizationName: string;
	role: OrganizationRole;
}

export interface RemoveOrgMemberRequest {
	organizationId: string;
	userId: string;
}

export interface RemoveOrgMemberResult {
	removed: true;
	demoted: number;
}

export type OrgStatementKind = 'topQuestion' | 'massConsensus' | 'join' | 'question';

export interface CreateOrgStatementRequest {
	organizationId: string;
	title: string;
	description?: string;
	kind: OrgStatementKind;
	parentId?: string;
	access?: Access;
	initialStatus?: QuestionStatus;
}

export interface CreateOrgStatementResult {
	statementId: string;
}

// --- Progress & nudges -----------------------------------------------------

export type NudgeAudience = 'all' | 'notSuggested' | 'notEvaluated';
export type NudgeChannel = 'inApp' | 'email';

export interface NudgeRequest {
	statementId: string;
	message: string;
	audience: NudgeAudience;
	channels: NudgeChannel[];
}

export interface NudgeResult {
	sent: number;
	inApp: number;
	email: number;
}

export interface RecomputeQuestionProgressRequest {
	statementId: string;
}

// --- Callables -------------------------------------------------------------

function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
	const fn = httpsCallable<Req, Res>(functions, name);

	return async (data: Req) => (await fn(data)).data;
}

export const createOrganization = callable<CreateOrganizationRequest, CreateOrganizationResult>(
	'fn_createOrganization',
);

export const inviteOrgMember = callable<InviteOrgMemberRequest, InviteOrgMemberResult>(
	'fn_inviteOrgMember',
);

export const resendOrgInvite = callable<ResendOrgInviteRequest, ResendOrgInviteResult>(
	'fn_resendOrgInvite',
);

export const revokeOrgInvite = callable<RevokeOrgInviteRequest, RevokeOrgInviteResult>(
	'fn_revokeOrgInvite',
);

export const acceptOrgInvite = callable<AcceptOrgInviteRequest, AcceptOrgInviteResult>(
	'fn_acceptOrgInvite',
);

export const removeOrgMember = callable<RemoveOrgMemberRequest, RemoveOrgMemberResult>(
	'fn_removeOrgMember',
);

export const createOrgStatement = callable<CreateOrgStatementRequest, CreateOrgStatementResult>(
	'fn_createOrgStatement',
);

export const nudgeQuestionSubscribers = callable<NudgeRequest, NudgeResult>(
	'fn_nudgeQuestionSubscribers',
);

export const recomputeQuestionProgress = callable<RecomputeQuestionProgressRequest, void>(
	'fn_recomputeQuestionProgress',
);
