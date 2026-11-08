import { useOrg } from '@/org/OrgContext';
import { useAgoraAccess } from '../AgoraHome/useAgoraAccess';
import { useGrace } from '../_shared/useGrace';
import { useAgoraDetailAccess } from '../AdminAgora/agoraBase';

export interface AccessTree {
	/** `/admin/agora` or `/agora`, by the URL the page is mounted at. */
	base: string;
	inAdminTree: boolean;
	/** First crumb: "Agora classrooms" (admin) or "My Agora classrooms". */
	rootLabel: string;
	/** May the page call the server? */
	enabled: boolean;
	/** Where to send someone who may not be here, or null. */
	redirectTo: string | null;
}

/**
 * The requests screens serve two trees from one component: the system
 * admin's (`/admin/agora/requests`) and a regional coordinator's
 * (`/agora/requests`). The callable decides what each caller may read; this
 * only keeps people who approve nothing off the screen.
 */
export function useAccessTree(): AccessTree {
	const detail = useAgoraDetailAccess();
	const { isSystemAdmin } = useOrg();
	const access = useAgoraAccess(!detail.inAdminTree);
	const notCoordinator = useGrace(
		!detail.inAdminTree && !access.loading && !access.isSupervisor && !isSystemAdmin,
	);

	let redirectTo: string | null = null;
	if (detail.denied) redirectTo = '/';
	else if (notCoordinator) redirectTo = '/agora';

	return {
		base: detail.base,
		inAdminTree: detail.inAdminTree,
		rootLabel: detail.rootLabel,
		enabled: detail.inAdminTree ? isSystemAdmin : access.isSupervisor || isSystemAdmin,
		redirectTo,
	};
}
