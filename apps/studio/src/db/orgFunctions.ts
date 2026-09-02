import { httpsCallable } from 'firebase/functions';
import type {
	Access,
	QuestionStatus,
	ScheduledActionStatus,
	StudioDraftCutoff,
	StudioExistingActivitySnapshot,
	StudioPlan,
	StudioPlanBuildResult,
	StudioPlanMessage,
	StudioScheduledActionKind,
} from '@freedi/shared-types';
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

/**
 * `document` creates a hidden Sign document under the top question
 * (`signSettings.isHidden`): admins write / review it in Sign, then open it
 * for comment from the dashboard.
 */
export type OrgStatementKind = 'topQuestion' | 'massConsensus' | 'join' | 'question' | 'document';

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

// --- Start a question with AI ---------------------------------------------

export interface StudioPlanStartRequest {
	organizationId: string;
	/** Existing-question mode: plan additions to this top question. */
	topQuestionId?: string;
	/** Studio UI language (ISO 639-1). */
	language: string;
	/** IANA timezone of the admin's browser. */
	timezone: string;
}

export interface StudioPlanStartResult {
	sessionId: string;
	message: StudioPlanMessage;
	plan?: StudioPlan;
	existingActivities?: StudioExistingActivitySnapshot[];
}

export interface StudioPlanMessageRequest {
	sessionId: string;
	message: string;
}

export interface StudioPlanMessageResult {
	message: StudioPlanMessage;
	plan?: StudioPlan;
	planVersion: number;
	readyToBuild: boolean;
	/** Why the plan cannot be built yet, in the admin's language. */
	problems?: string[];
}

export interface StudioPlanBuildRequest {
	sessionId: string;
}

export interface StudioPlanRateRequest {
	sessionId: string;
	value: 'up' | 'down';
	note?: string;
}

export interface StudioPlanRateResult {
	ok: true;
}

export interface ScheduledNudgeInput {
	message: string;
	audience?: NudgeAudience;
	channels?: NudgeChannel[];
}

/** `draft` actions: write the target document from these sources at `runAt`. */
export interface ScheduledDraftInput {
	sourceStatementIds: string[];
	cutoff: StudioDraftCutoff;
	intent?: string;
}

export interface ScheduledActionUpsertRequest {
	/** Omit to create. */
	scheduledActionId?: string;
	statementId: string;
	action: StudioScheduledActionKind;
	/** Epoch ms. */
	runAt: number;
	nudge?: ScheduledNudgeInput;
	/** `draft` only. */
	draft?: ScheduledDraftInput;
}

export interface ScheduledActionUpsertResult {
	scheduledActionId: string;
}

export interface ScheduledActionCancelRequest {
	scheduledActionId: string;
}

export interface ScheduledActionCancelResult {
	scheduledActionId: string;
	status: ScheduledActionStatus;
}

// --- Documents (Sign) -----------------------------------------------------

/**
 * Write a document from the top suggestions of its source activities. Takes
 * 10–40 s. Fails with `failed-precondition` when nothing passes the cutoff.
 * Replaces the AI-written paragraphs of a previous draft.
 */
export interface StudioDraftFromResultsRequest {
	documentId: string;
	/** Defaults to the document's planned `draftFrom` sources. */
	sourceStatementIds?: string[];
	cutoff?: StudioDraftCutoff;
	intent?: string;
}

export interface StudioDraftFromResultsResult {
	documentId: string;
	paragraphCount: number;
	/** Questions the sources left unanswered, listed at the end of the draft. */
	openGaps: number;
	signAdminUrl: string;
}

/** Document run state, written to `signSettings` (open for comment / frozen / closed). */
export type DocumentRunStatus = 'open' | 'frozen' | 'closed';

export interface StudioSetDocumentStatusRequest {
	statementId: string;
	status: DocumentRunStatus;
}

export interface StudioSetDocumentStatusResult {
	statementId: string;
	status: DocumentRunStatus;
}

// --- Crowd surveys: starting suggestions -----------------------------------

/**
 * Seed a crowd survey with AI-written starting suggestions so the first
 * participants have something to rate. `count` is the target number of
 * suggestions under the question. Fails with `failed-precondition` when the
 * statement is not a crowd survey.
 */
export interface StudioSeedOptionsRequest {
	statementId: string;
	/** Defaults to `STUDIO_SEED_OPTIONS_COUNT`. */
	count?: number;
	/** What kind of suggestions to write (free text from the admin). */
	intent?: string;
	/** Language of the suggestions (ISO 639-1); defaults to the survey's. */
	language?: string;
}

export interface StudioSeedOptionsResult {
	statementId: string;
	/** Suggestions written by this call. */
	created: number;
	/** Suggestions under the question after the call. */
	total: number;
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

export const studioPlanStart = callable<StudioPlanStartRequest, StudioPlanStartResult>(
	'fn_studioPlanStart',
);

export const studioPlanMessage = callable<StudioPlanMessageRequest, StudioPlanMessageResult>(
	'fn_studioPlanMessage',
);

export const studioPlanBuild = callable<StudioPlanBuildRequest, StudioPlanBuildResult>(
	'fn_studioPlanBuild',
);

export const studioPlanRate = callable<StudioPlanRateRequest, StudioPlanRateResult>(
	'fn_studioPlanRate',
);

export const scheduledActionUpsert = callable<
	ScheduledActionUpsertRequest,
	ScheduledActionUpsertResult
>('fn_studioScheduledActionUpsert');

export const studioDraftFromResults = callable<
	StudioDraftFromResultsRequest,
	StudioDraftFromResultsResult
>('fn_studioDraftFromResults');

export const studioSetDocumentStatus = callable<
	StudioSetDocumentStatusRequest,
	StudioSetDocumentStatusResult
>('fn_studioSetDocumentStatus');

export const studioSeedOptions = callable<StudioSeedOptionsRequest, StudioSeedOptionsResult>(
	'fn_studioSeedOptions',
);

export const scheduledActionCancel = callable<
	ScheduledActionCancelRequest,
	ScheduledActionCancelResult
>('fn_studioScheduledActionCancel');
