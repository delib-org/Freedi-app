import type { AgoraClass, AgoraSchool } from './agoraClassroom';

/**
 * Who a supervisor may look at.
 *
 * A supervisor is attached to a school by a sys-admin (`supervisorMap` on the
 * school doc) and, optionally, narrowed to some of its teachers
 * (`supervisorScopes[uid].teacherIds`). Everything the supervisor console
 * serves is filtered through ONE of these scope values, computed once per
 * request by `resolveSupervisorScope`, so the five views cannot disagree
 * about what is in bounds.
 *
 * - `admin`: a sys-admin — every school, every teacher, every class.
 * - `all`: a supervisor of this school with no narrowing.
 * - `teachers`: a supervisor of this school narrowed to `teacherIds`.
 *
 * Pure. The functions layer only ever adds the reads.
 */
export type SupervisorScope =
	| { kind: 'admin' }
	| { kind: 'all'; schoolId: string }
	| { kind: 'teachers'; schoolId: string; teacherIds: ReadonlySet<string> };

type ScopedSchool = Pick<AgoraSchool, 'schoolId' | 'status' | 'supervisorMap' | 'supervisorScopes'>;

/**
 * The scope a caller holds on a school, or null when they hold none.
 *
 * An archived school is closed to its supervisors — the attachment outlives
 * the school only for the sys-admin, who still gets `admin` (the archive
 * is theirs to look back at).
 */
export function resolveSupervisorScope(
	school: ScopedSchool,
	uid: string,
	isAdmin: boolean,
): SupervisorScope | null {
	if (isAdmin) return { kind: 'admin' };
	if (school.status !== 'active') return null;
	if (school.supervisorMap?.[uid] !== true) return null;
	const narrowed = school.supervisorScopes?.[uid];
	if (narrowed === undefined) return { kind: 'all', schoolId: school.schoolId };

	return {
		kind: 'teachers',
		schoolId: school.schoolId,
		teacherIds: new Set(narrowed.teacherIds),
	};
}

/** May this scope see this teacher? */
export function isTeacherInScope(scope: SupervisorScope, teacherId: string): boolean {
	if (scope.kind === 'admin' || scope.kind === 'all') return true;

	return scope.teacherIds.has(teacherId);
}

/**
 * May this scope see this class? The class must belong to the scope's school
 * and, under a narrowed scope, share at least one teacher with it.
 */
export function isClassInScope(
	scope: SupervisorScope,
	cls: Pick<AgoraClass, 'schoolId' | 'teacherIds'>,
): boolean {
	if (scope.kind === 'admin') return true;
	if (cls.schoolId !== scope.schoolId) return false;
	if (scope.kind === 'all') return true;

	return cls.teacherIds.some((teacherId) => scope.teacherIds.has(teacherId));
}

/**
 * Every teacher uid of a school: the ones attached to the school itself and
 * the ones on any of its classes. Deduped and sorted, so two callers with the
 * same inputs produce the same list (the scope editor and the console rows).
 */
export function schoolTeacherUids(
	school: Pick<AgoraSchool, 'schoolId' | 'teacherIds'>,
	classes: ReadonlyArray<Pick<AgoraClass, 'schoolId' | 'teacherIds'>>,
): string[] {
	const uids = new Set<string>(school.teacherIds ?? []);
	for (const cls of classes) {
		if (cls.schoolId !== school.schoolId) continue;
		for (const teacherId of cls.teacherIds) uids.add(teacherId);
	}

	return [...uids].sort();
}
