import { Navigate } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import StudioPage from '../_shared/StudioPage';
import { Loading } from '../AdminAgora/sections/LoadState';
import AccessRequestsView from './AccessRequestsView';
import { useAccessTree } from './useAccessTree';

/**
 * `/admin/agora/requests` and `/agora/requests` — "Access requests". One
 * screen for system admins and regional coordinators; the callable scopes it.
 */
export default function AccessRequests() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const tree = useAccessTree();
	const title = t('Access requests');
	const crumbs = [{ label: tree.rootLabel, to: tree.base }, { label: title }];

	if (tree.redirectTo) return <Navigate to={tree.redirectTo} replace />;

	return (
		<StudioPage breadcrumb={crumbs} title={title}>
			{tree.enabled && user ? <AccessRequestsView base={tree.base} uid={user.uid} /> : <Loading />}
		</StudioPage>
	);
}
