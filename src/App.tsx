import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { AgreementProvider } from './context/AgreementProvider';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import Accessibility from './view/components/accessibility/Accessibility';
import NotificationTester from './view/components/notifications/NotificationTester';

export default function App() {
	const { isLoading, user } = useAuthentication();

	if (isLoading) {
		return <LoadingPage />;
	}

	return (
		<Suspense fallback={<LoadingPage />}>
			<Accessibility />
			<AgreementProvider user={user}>
				<Outlet />
				<NotificationTester />
			</AgreementProvider>
		</Suspense>
	);
}
