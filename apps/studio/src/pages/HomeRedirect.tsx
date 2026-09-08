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
	// Both flags arrive on their own snapshots, and the memberships usually come
	// last — so an empty org list is not yet evidence of anything. Wait for it to
	// settle before acting on it, or a system admin who belongs to two
	// organizations is sent to the admin screens every time they open the app.
	const settled = useGrace(!loading && orgs.length === 0);

	if (loading) return <div className="studio-loading">{t('Loading…')}</div>;
	if (orgs.length === 1) return <Navigate to={`/orgs/${orgs[0].organizationId}`} replace />;
	if (orgs.length > 1) return <Navigate to="/orgs" replace />;
	if (!settled) return <div className="studio-loading">{t('Loading…')}</div>;

	// No organizations at all.
	if (isSystemAdmin) return <Navigate to="/admin/orgs" replace />;

	// Nothing to pick between: their own events are the only workspace they have,
	// and "you are not a member of any organization" is not a home screen.
	return <Navigate to="/personal" replace />;
}
