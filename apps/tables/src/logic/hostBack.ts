import type { TableAssignment } from '@freedi/shared-types';
import { hostHomePath, hostListPath } from '@/paths';

/** The two host screens that `/host/sessions/:id` redirects to, by status. */
export type StageScreen = 'preview' | 'assignment';

export interface BackTarget {
	href: string;
	/** True when Back leaves the assignment for the list. */
	toList: boolean;
}

/**
 * Is this screen the one the assignment's home sends the host to? The home
 * redirects ranked + registrationClosed to Preview, and published or ended to
 * the Assignment (views/host/HostHome.ts).
 */
export function isStageScreen(
	session: Pick<TableAssignment, 'status' | 'mode'>,
	screen: StageScreen,
): boolean {
	if (screen === 'preview') {
		return session.status === 'registrationClosed' && session.mode === 'ranked';
	}

	return session.status === 'published' || session.status === 'ended';
}

/**
 * Back from a host sub-screen. On its stage screen "back to the assignment"
 * would redirect straight back to the same screen, so Back goes to the list.
 */
export function backTargetFor(
	session: Pick<TableAssignment, 'tableAssignmentId' | 'status' | 'mode'>,
	screen: StageScreen | undefined,
): BackTarget {
	if (screen && isStageScreen(session, screen)) return { href: hostListPath(), toList: true };

	return { href: hostHomePath(session.tableAssignmentId), toList: false };
}
