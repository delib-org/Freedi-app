import { Navigate } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useGrace } from './_shared/useGrace';

/**
 * `/` — send the user to the workspace they most likely want:
 * sysadmin with no orgs → the admin screens; exactly one org → that org;
 * no orgs at all → their own events, which is the only workspace they have;
 * otherwise the picker.
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
	// Nothing to pick between: an account with no organizations has exactly one
	// workspace, and being shown "you are not a member of any organization" as a
	// home screen tells them nothing they can act on.
	if (orgs.length === 0) return <Navigate to="/personal" replace />;

	return <Navigate to="/orgs" replace />;
}
