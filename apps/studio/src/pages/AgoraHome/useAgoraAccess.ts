import { useMemo } from 'react';
import type { TeacherConsoleDashboard } from '@freedi/shared-types';
import { useOwnTeacherView } from '@/db/agoraTeacher';

/**
 * What the signed-in person is in Agora, derived (never stored) from the
 * teacher console's dashboard: a teacher is attached to a school or has a
 * class; a regional coordinator (`supervisor` in code) supervises at least
 * one active school. Both at once is allowed.
 */
export interface AgoraAccess {
	loading: boolean;
	isTeacher: boolean;
	/** A regional coordinator. */
	isSupervisor: boolean;
	/** The active schools they coordinate, sorted by name. */
	supervisedSchools: TeacherConsoleDashboard['supervisedSchools'];
	dashboard: TeacherConsoleDashboard | null;
}

/** Pure, so the rule is testable without Firebase. */
export function accessFromDashboard(
	dashboard: TeacherConsoleDashboard | null,
): Pick<AgoraAccess, 'isTeacher' | 'isSupervisor' | 'supervisedSchools'> {
	if (!dashboard) return { isTeacher: false, isSupervisor: false, supervisedSchools: [] };

	return {
		isTeacher: dashboard.schools.length > 0 || dashboard.classes.length > 0,
		isSupervisor: dashboard.supervisedSchools.length > 0,
		supervisedSchools: dashboard.supervisedSchools,
	};
}

/**
 * `enabled: false` makes no call, so screens that do not need the answer
 * (an organization's questions) cost nothing. A failed call counts as "no
 * Agora access": the workspace entry simply does not appear.
 */
export function useAgoraAccess(enabled = true): AgoraAccess {
	const { data, loading } = useOwnTeacherView('dashboard', enabled);

	return useMemo(
		() => ({ loading: enabled && loading, dashboard: data, ...accessFromDashboard(data) }),
		[enabled, loading, data],
	);
}
