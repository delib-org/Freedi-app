import { useMemo } from 'react';
import type { AgoraAccessActor } from '@freedi/shared-types';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { useAgoraAccess } from '../AgoraHome/useAgoraAccess';

/**
 * The signed-in person as the shared access policy sees them: a system admin,
 * or a regional coordinator of the active schools they supervise. Used to show
 * or hide "Remove access"; the callable enforces the same rule.
 */
export function useAccessActor(): AgoraAccessActor | null {
	const { user } = useAuth();
	const { isSystemAdmin } = useOrg();
	const { supervisedSchools } = useAgoraAccess(!isSystemAdmin);

	return useMemo(
		() =>
			user
				? {
						uid: user.uid,
						isAdmin: isSystemAdmin,
						supervisedSchoolIds: new Set(supervisedSchools.map((school) => school.schoolId)),
					}
				: null,
		[user, isSystemAdmin, supervisedSchools],
	);
}
