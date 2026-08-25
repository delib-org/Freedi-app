import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { OrgProvider } from '@/org/OrgContext';
import { useDocumentDirection } from '@/hooks/useDocumentDirection';
import { ToastUndoHost } from '@/components/atomic/molecules/ToastUndo';
import Login from '@/pages/Login';
import HomeRedirect from '@/pages/HomeRedirect';
import OrgPicker from '@/pages/OrgPicker/OrgPicker';
import OrgQuestions from '@/pages/OrgQuestions/OrgQuestions';
import People from '@/pages/People/People';
import Invite from '@/pages/Invite/Invite';
import AdminOrgs from '@/pages/AdminOrgs/AdminOrgs';
import AdminOrgDetail from '@/pages/AdminOrgs/AdminOrgDetail';
import EventDashboard from '@/pages/EventDashboard';

// Heavy per-question screens load on demand.
const QuestionDashboard = lazy(() => import('@/pages/QuestionDashboard/QuestionDashboard'));
const RunView = lazy(() => import('@/pages/RunView/RunView'));

export default function App() {
	const { user, loading } = useAuth();
	const { t } = useTranslation();
	const location = useLocation();
	useDocumentDirection();

	if (loading) {
		return <div className="studio-loading">{t('Loading…')}</div>;
	}

	if (!user) {
		// The URL (e.g. /invite?token=…) is untouched, so the flow resumes after sign-in.
		return (
			<Login
				message={
					location.pathname === '/invite' ? t('Sign in to accept your invitation') : undefined
				}
			/>
		);
	}

	const fallback = <div className="studio-loading">{t('Loading…')}</div>;

	return (
		<OrgProvider>
			<ToastUndoHost />
			<Suspense fallback={fallback}>
				<Routes>
					<Route path="/" element={<HomeRedirect />} />
					<Route path="/orgs" element={<OrgPicker />} />
					<Route path="/orgs/:orgId" element={<OrgQuestions />} />
					<Route path="/orgs/:orgId/people" element={<People />} />
					<Route path="/orgs/:orgId/questions/:qId" element={<QuestionDashboard />} />
					<Route path="/orgs/:orgId/questions/:qId/run/:aId" element={<RunView />} />
					<Route path="/events/:eventId" element={<EventDashboard />} />
					<Route path="/invite" element={<Invite />} />
					<Route path="/admin/orgs" element={<AdminOrgs />} />
					<Route path="/admin/orgs/:orgId" element={<AdminOrgDetail />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</Suspense>
		</OrgProvider>
	);
}
