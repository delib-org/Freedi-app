import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { AgreementProvider } from './context/AgreementProvider';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import Accessibility from './view/components/accessibility/Accessibility';

export default function App() {
	const { isAuthenticated, isLoading, user } = useAuthentication();

	if (isLoading) {
		return <LoadingPage />;
	}

	if (!isAuthenticated) {
		return null;
	}

	return (
		<Suspense fallback={<LoadingPage />}>
			<AgreementProvider user={user}>
				<Accessibility />
				<Outlet />
			</AgreementProvider>
		</Suspense>
	);
}
