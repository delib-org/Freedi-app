import { Navigate } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useGrace } from './_shared/useGrace';

/**
 * `/` — send the user where they most likely want to be:
 * sysadmin with no orgs → /admin/orgs; exactly one org → that org;
 * otherwise the picker (which also shows personal events).
 */
export default function HomeRedirect() {
	const { t } = useTranslation();
	const { orgs, isSystemAdmin, loading } = useOrg();
	// The system-admin flag arrives on its own snapshot with no loading state,
	// so an org-less account waits a moment before being sent to the picker.
	const settled = useGrace(!loading && orgs.length === 0 && !isSystemAdmin);

	if (loading) return <div className="studio-loading">{t('Loading…')}</div>;
	if (isSystemAdmin && orgs.length === 0) return <Navigate to="/admin/orgs" replace />;
	if (orgs.length === 1) return <Navigate to={`/orgs/${orgs[0].organizationId}`} replace />;
	if (orgs.length === 0 && !settled) return <div className="studio-loading">{t('Loading…')}</div>;

	return <Navigate to="/orgs" replace />;
}
