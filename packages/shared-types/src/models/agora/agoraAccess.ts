import {
	array,
	maxLength,
	number,
	object,
	optional,
	picklist,
	pipe,
	string,
	InferOutput,
} from 'valibot';

/**
 * Access requests: how a person asks to become an Agora teacher or a
 * regional coordinator (wire name `supervisor`), and how an approver decides.
 * IA spec: docs/ia/studio-teacher-approval.md.
 *
 * Approval itself is NOT stored here. The request is the paper trail; an
 * approval lands on the person's `agoraApprovedTeachers/{uid}` marker as a
 * `grant` (see agoraLibrary.ts) and, when a school was chosen, as an attachment
 * on the school doc. `resolveApproval` in functions/src/agora/libraryAccess.ts
 * is the one place that turns those into yes/no.
 *
 * PRIVACY: the applicant's sign-in email is never written to a request. An
 * approver reads it through `agoraManageAccess`, from `usersV2`, and only for
 * requests they may act on.
 */

export const AGORA_ACCESS = {
	/** Requests one person may submit in a rolling week (spam guard) */
	REQUESTS_PER_WEEK: 5,
	ROLLING_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
	MAX_NAME_LENGTH: 80,
	MAX_SCHOOL_TEXT_LENGTH: 120,
	MAX_CITY_LENGTH: 60,
	MAX_NOTE_LENGTH: 300,
	MAX_REASON_LENGTH: 300,
	/** Schools a coordinator approval may grant in one go */
	MAX_GRANTED_SCHOOLS: 30,
	/** Rows one `list` call returns, newest decisions first / oldest pending first */
	LIST_LIMIT: 200,
} as const;

export const AgoraAccessRoleSchema = picklist(['teacher', 'supervisor']);
export type AgoraAccessRole = InferOutput<typeof AgoraAccessRoleSchema>;

export const AgoraAccessStatusSchema = picklist(['pending', 'approved', 'declined', 'withdrawn']);
export type AgoraAccessStatus = InferOutput<typeof AgoraAccessStatusSchema>;

/** form = typed school name; link = a school's sign-up link; coTeacher = added to a class by email */
export const AgoraAccessSourceSchema = picklist(['form', 'link', 'coTeacher']);
export type AgoraAccessSource = InferOutput<typeof AgoraAccessSourceSchema>;

export const AgoraAccessDecidedViaSchema = picklist(['admin', 'supervisor']);
export type AgoraAccessDecidedVia = InferOutput<typeof AgoraAccessDecidedViaSchema>;

/** `agoraAccessRequests/{requestId}`. Server-written only. Timestamps in ms. */
export const AgoraAccessRequestSchema = object({
	requestId: string(),
	uid: string(),
	role: AgoraAccessRoleSchema,
	fullName: pipe(string(), maxLength(AGORA_ACCESS.MAX_NAME_LENGTH)),
	/** Set when the request came through a school's link, or a co-teacher add */
	schoolId: optional(string()),
	/** Typed by the applicant when there was no link */
	schoolNameText: optional(pipe(string(), maxLength(AGORA_ACCESS.MAX_SCHOOL_TEXT_LENGTH))),
	city: optional(pipe(string(), maxLength(AGORA_ACCESS.MAX_CITY_LENGTH))),
	note: optional(pipe(string(), maxLength(AGORA_ACCESS.MAX_NOTE_LENGTH))),
	source: AgoraAccessSourceSchema,
	status: AgoraAccessStatusSchema,
	/** The schools an approval attached the person to (empty = approved with no school) */
	grantedSchoolIds: optional(array(string())),
	decidedBy: optional(string()),
	decidedVia: optional(AgoraAccessDecidedViaSchema),
	decidedAt: optional(number()),
	declineReason: optional(pipe(string(), maxLength(AGORA_ACCESS.MAX_REASON_LENGTH))),
	/** For a coTeacher request: who added them */
	addedBy: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraAccessRequest = InferOutput<typeof AgoraAccessRequestSchema>;

// ─── Who may decide (pure; the callable and the Studio UI share it) ─────────

export interface AgoraAccessActor {
	uid: string;
	isAdmin: boolean;
	/** Active schools whose `supervisorMap` names this actor */
	supervisedSchoolIds: ReadonlySet<string>;
}

/**
 * The approval rule, as one function. A sys-admin decides anything. A regional
 * coordinator decides TEACHER requests only, and only for a school they
 * coordinate. Nobody decides their own request, and only a pending one.
 */
export function canDecideAccessRequest(
	actor: AgoraAccessActor,
	request: Pick<AgoraAccessRequest, 'uid' | 'role' | 'schoolId' | 'status'>,
): boolean {
	if (request.status !== 'pending') return false;
	if (actor.isAdmin) return true;
	if (request.uid === actor.uid) return false;
	if (request.role !== 'teacher') return false;

	return request.schoolId !== undefined && actor.supervisedSchoolIds.has(request.schoolId);
}

/** May this actor SEE this request (any status)? Same rule, without the pending/self checks. */
export function canSeeAccessRequest(
	actor: AgoraAccessActor,
	request: Pick<AgoraAccessRequest, 'uid' | 'role' | 'schoolId'>,
): boolean {
	if (actor.isAdmin || request.uid === actor.uid) return true;
	if (request.role !== 'teacher') return false;

	return request.schoolId !== undefined && actor.supervisedSchoolIds.has(request.schoolId);
}

/**
 * May this actor remove `role` access at `schoolId`? Admins: any role, any
 * school (or everywhere, `schoolId` undefined). Coordinators: teachers only,
 * at a school they coordinate, and — when narrowed — only teachers in scope.
 */
export function canRemoveAccess(
	actor: AgoraAccessActor,
	target: { uid: string; role: AgoraAccessRole; schoolId?: string },
	teacherInScope: boolean,
): boolean {
	if (actor.isAdmin) return true;
	if (target.uid === actor.uid) return false;
	if (target.role !== 'teacher' || target.schoolId === undefined) return false;

	return actor.supervisedSchoolIds.has(target.schoolId) && teacherInScope;
}

// ─── Callables ─────────────────────────────────────────────────────────────

/** `agoraRequestAccess` — the applicant's door. */
export type RequestAccessRequest =
	| {
			action: 'submit';
			role: AgoraAccessRole;
			fullName: string;
			/** From the sign-up link (`/teach/request?school=<id>`) */
			schoolId?: string;
			/** Without a link: the school as the applicant names it, and its city */
			schoolNameText?: string;
			city?: string;
			note?: string;
	  }
	| { action: 'withdraw'; requestId: string }
	| { action: 'status' };

export interface AccessStatusRow {
	requestId: string;
	role: AgoraAccessRole;
	status: AgoraAccessStatus;
	schoolId?: string;
	/** The school's name when `schoolId` is set, else the applicant's own text */
	schoolName?: string;
	declineReason?: string;
	createdAt: number;
	decidedAt?: number;
}

export type RequestAccessResponse =
	| { action: 'submit'; requestId: string; status: 'pending' }
	| { action: 'withdraw'; requestId: string; status: 'withdrawn' }
	| {
			action: 'status';
			/** Approved now (admin, attached to an active school, or granted) */
			approved: boolean;
			isAdmin: boolean;
			/** Own requests, newest first (at most 10) */
			requests: AccessStatusRow[];
	  };

/** `agoraManageAccess` — the approvers' door (admins and coordinators). */
export type ManageAccessRequest =
	| {
			action: 'list';
			/** Default 'pending' */
			status?: AgoraAccessStatus;
			/** Narrow to one school; admin only: 'none' = requests with no school */
			schoolId?: string;
	  }
	| { action: 'get'; requestId: string }
	| { action: 'count' }
	| {
			action: 'approve';
			requestId: string;
			/** Teacher request: admin may pick (or override) the school; coordinators may not */
			schoolId?: string;
			/** Coordinator (supervisor) request, admin only: the schools to attach (≥1) */
			schoolIds?: string[];
	  }
	| { action: 'decline'; requestId: string; reason?: string }
	| {
			action: 'remove';
			uid: string;
			role: AgoraAccessRole;
			/** Required for coordinators. Admin may omit it: removed from every school and the grant revoked */
			schoolId?: string;
	  };

/** One request as an approver sees it: the request plus who the applicant is */
export interface AccessRequestRow extends AgoraAccessRequest {
	/** Read from usersV2 at call time; never stored on the request */
	applicantEmail?: string;
	applicantDisplayName?: string;
	schoolName?: string;
}

export interface AccessSchoolOption {
	schoolId: string;
	name: string;
	city?: string;
}

export type ManageAccessResponse =
	| {
			action: 'list';
			isAdmin: boolean;
			requests: AccessRequestRow[];
			/** The schools the caller may decide for (coordinator) or every active school (admin) */
			schools: AccessSchoolOption[];
	  }
	| {
			action: 'get';
			request: AccessRequestRow;
			/** Lessons (sessions) the applicant already ran */
			lessonsRun: number;
			/** Whether the applicant is approved right now (e.g. at another school) */
			applicantApproved: boolean;
			canDecide: boolean;
	  }
	| { action: 'count'; pending: number }
	| { action: 'approve'; requestId: string; status: 'approved'; grantedSchoolIds: string[] }
	| { action: 'decline'; requestId: string; status: 'declined' }
	| {
			action: 'remove';
			uid: string;
			removedFromSchoolIds: string[];
			/** Whether the person is still approved afterwards (e.g. via another school) */
			stillApproved: boolean;
	  };
