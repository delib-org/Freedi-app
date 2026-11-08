import type {
	AccessRequestRow,
	AccessSchoolOption,
	AgoraAccessActor,
	AgoraAccessRole,
	AgoraAccessStatus,
} from '@freedi/shared-types';

/**
 * Pure helpers for the access-requests screens, so the rules the buttons
 * follow are testable without React or Firebase. Who may decide, see or
 * remove is NOT decided here: that is `canDecideAccessRequest` and friends in
 * `@freedi/shared-types`, the same functions the callable enforces with.
 */

export type RoleFilter = 'all' | AgoraAccessRole;

/** The id the school filter uses for "requests with no school" (admins only). */
export const NO_SCHOOL = 'none';

/**
 * The caller as the shared policy sees them, rebuilt from a `list` answer:
 * the callable returns `isAdmin` and, for a coordinator, exactly the schools
 * they may decide for.
 */
export function actorFromList(
	uid: string,
	isAdmin: boolean,
	schools: ReadonlyArray<AccessSchoolOption>,
): AgoraAccessActor {
	return {
		uid,
		isAdmin,
		supervisedSchoolIds: new Set(isAdmin ? [] : schools.map((school) => school.schoolId)),
	};
}

/** Pending: oldest first, so nothing rots at the bottom. Decided: newest decision first. */
export function sortRequests(
	rows: ReadonlyArray<AccessRequestRow>,
	status: AgoraAccessStatus,
): AccessRequestRow[] {
	const copy = [...rows];
	if (status === 'pending') return copy.sort((a, b) => a.createdAt - b.createdAt);

	return copy.sort((a, b) => (b.decidedAt ?? b.lastUpdate) - (a.decidedAt ?? a.lastUpdate));
}

/** Who the applicant is, for the row title: the account name, else what they typed. */
export function applicantName(row: Pick<AccessRequestRow, 'applicantDisplayName' | 'fullName'>) {
	return row.fullName || row.applicantDisplayName || '';
}

/** Role filter plus a case-insensitive search over name and email. */
export function filterRequests(
	rows: ReadonlyArray<AccessRequestRow>,
	filter: { role: RoleFilter; search: string },
): AccessRequestRow[] {
	const needle = filter.search.trim().toLowerCase();

	return rows.filter((row) => {
		if (filter.role !== 'all' && row.role !== filter.role) return false;
		if (!needle) return true;
		const haystack = [row.fullName, row.applicantDisplayName, row.applicantEmail]
			.filter((part): part is string => !!part)
			.join(' ')
			.toLowerCase();

		return haystack.includes(needle);
	});
}

/** Where the applicant says they teach: the school's name, else their own words. */
export function schoolLabel(
	row: Pick<AccessRequestRow, 'schoolName' | 'schoolNameText' | 'city'>,
): string {
	const name = row.schoolName ?? row.schoolNameText ?? '';

	return row.city && !row.schoolName ? `${name}, ${row.city}` : name;
}

/** The school ids a coordinator-role approval is allowed to submit. */
export function canSubmitSchools(role: AgoraAccessRole, schoolIds: ReadonlyArray<string>): boolean {
	return role === 'supervisor' ? schoolIds.length > 0 : true;
}
