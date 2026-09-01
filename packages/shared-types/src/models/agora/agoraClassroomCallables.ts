import type { AgoraSessionFlow } from './sessionFlow';

/**
 * Wire contracts of the classroom-hierarchy callables (schools, classes,
 * rosters). Both the clients (agora teacher console, studio sys-admin console)
 * and each function under `functions/src/agora` import from here — drift is a
 * compile error, exactly as with `agoraCivicCallables`.
 *
 * Field names are the wire format. Do not rename them.
 */

/** `agoraAdminManageSchool` — sys-admin only. */
export interface ManageSchoolRequest {
	action: 'create' | 'rename' | 'archive';
	schoolId?: string;
	name?: string;
	city?: string;
}

export interface ManageSchoolResponse {
	schoolId: string;
}

/** `agoraAdminOpenClass` — sys-admin only. */
export interface OpenClassRequest {
	action: 'create' | 'rename' | 'archive' | 'assignTeacher' | 'removeTeacher';
	schoolId?: string;
	classId?: string;
	name?: string;
	gradeLevel?: string;
	/** assignTeacher/removeTeacher: the teacher's sign-in email, looked up server-side */
	teacherEmail?: string;
}

export interface OpenClassResponse {
	classId: string;
	/** Present on create — the persistent code students claim roster spots with */
	classCode?: string;
	/** Present on assignTeacher — the resolved uid, echoed for the admin UI */
	teacherUid?: string;
}

/**
 * `agoraJoinClass` — the student-side roster flow. Anonymous auth is the
 * point: this is how an anon uid becomes (or re-becomes) a class member.
 */
export interface JoinClassRequest {
	classCode: string;
	mode: 'claim' | 'reclaim' | 'listAliases';
	/** claim: the nickname the student wants */
	alias?: string;
	/** reclaim: which roster spot */
	memberId?: string;
	/** reclaim: the 4-digit rejoin PIN */
	pin?: string;
}

export interface JoinClassAliasRow {
	memberId: string;
	alias: string;
}

export interface JoinClassResponse {
	classId: string;
	className: string;
	/** claim/reclaim: the caller's roster spot */
	memberId?: string;
	alias?: string;
	/** claim only (and teacher resets): shown once, never stored raw */
	pin?: string;
	/** listAliases: the picker rows for "I've played before, new device" */
	aliases?: JoinClassAliasRow[];
}

/** `agoraTeacherRoster` — teacher-of-class only. */
export interface TeacherRosterRequest {
	classId: string;
	action: 'renameAlias' | 'removeMember' | 'resetBinding';
	memberId: string;
	/** renameAlias: the new nickname */
	alias?: string;
}

export interface TeacherRosterResponse {
	memberId: string;
	/** resetBinding: the fresh PIN the teacher hands the student — shown once */
	pin?: string;
}

/** New optional fields `agoraCreateSession` accepts for class games. */
export interface CreateSessionClassroomFields {
	/** Link the session to a class (teacher must be in its teacherIds) */
	classId?: string;
	/** Which beats to run — the classroom counterpart of the civic script */
	flow?: AgoraSessionFlow;
}
