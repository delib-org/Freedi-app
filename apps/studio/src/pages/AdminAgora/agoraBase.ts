import { useMatch } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useGrace } from '../_shared/useGrace';

/** The system admin's Agora tree. */
export const ADMIN_AGORA_BASE = '/admin/agora';
/** A teacher's or regional coordinator's own Agora tree. */
export const PERSONAL_AGORA_BASE = '/agora';

export interface AgoraDetailAccess {
	/** `/admin/agora` or `/agora`, by the URL the page is mounted at. */
	base: string;
	/** True under `/admin/agora`. */
	inAdminTree: boolean;
	/** The first crumb's label. */
	rootLabel: string;
	/**
	 * May the page fetch? Under `/admin/agora` only a system admin; under
	 * `/agora` anyone signed in, because the callable decides what each caller
	 * may read and answers permission-denied otherwise.
	 */
	enabled: boolean;
	/** The admin tree was opened by someone who is not a system admin. */
	denied: boolean;
}

/**
 * The teacher, class and student pages serve two trees. This is the one place
 * that says which, so a page never repeats the admin-only gate or hardcodes
 * a link base.
 */
export function useAgoraDetailAccess(): AgoraDetailAccess {
	const { t } = useTranslation();
	const { isSystemAdmin, loading } = useOrg();
	const inAdminTree = useMatch('/admin/*') !== null;
	const denied = useGrace(inAdminTree && !loading && !isSystemAdmin);

	return {
		base: inAdminTree ? ADMIN_AGORA_BASE : PERSONAL_AGORA_BASE,
		inAdminTree,
		rootLabel: inAdminTree ? t('Agora classrooms') : t('My Agora classrooms'),
		enabled: inAdminTree ? isSystemAdmin : true,
		denied,
	};
}
