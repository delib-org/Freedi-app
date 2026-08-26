import { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { OrgProvider } from '@/org/OrgContext';
import { useDocumentDirection } from '@/hooks/useDocumentDirection';
import { ToastUndoHost } from '@/components/atomic/molecules/ToastUndo';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { lazyWithRetry } from '@/utils/lazyWithRetry';
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
const QuestionDashboard = lazyWithRetry(
	() => import('@/pages/QuestionDashboard/QuestionDashboard'),
	'QuestionDashboard',
);
const RunView = lazyWithRetry(() => import('@/pages/RunView/RunView'), 'RunView');
const PlanWithAI = lazyWithRetry(() => import('@/pages/PlanWithAI/PlanWithAI'), 'PlanWithAI');

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
			<AppErrorBoundary>
				<Suspense fallback={fallback}>
					<Routes>
						<Route path="/" element={<HomeRedirect />} />
						<Route path="/orgs" element={<OrgPicker />} />
						<Route path="/orgs/:orgId" element={<OrgQuestions />} />
						<Route path="/orgs/:orgId/people" element={<People />} />
						<Route path="/orgs/:orgId/plan/new" element={<PlanWithAI />} />
						<Route path="/orgs/:orgId/questions/:qId" element={<QuestionDashboard />} />
						<Route path="/orgs/:orgId/questions/:qId/plan" element={<PlanWithAI />} />
						<Route path="/orgs/:orgId/questions/:qId/run/:aId" element={<RunView />} />
						<Route path="/events/:eventId" element={<EventDashboard />} />
						<Route path="/invite" element={<Invite />} />
						<Route path="/admin/orgs" element={<AdminOrgs />} />
						<Route path="/admin/orgs/:orgId" element={<AdminOrgDetail />} />
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</Suspense>
			</AppErrorBoundary>
		</OrgProvider>
	);
}
