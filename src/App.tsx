import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { AgreementProvider } from './context/AgreementProvider';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import Accessibility from './view/components/accessibility/Accessibility';
import { ListenerStats } from './view/components/ListenerStats';
import OfflineAlert from './view/components/offlineAlert/OfflineAlert';

export default function App() {
	const { isLoading, user } = useAuthentication();

	if (isLoading) {
		return <LoadingPage />;
	}

	return (
		<Suspense fallback={<LoadingPage />}>
			<Accessibility />
			<ListenerStats />
			<OfflineAlert />
			<AgreementProvider user={user}>
				<Outlet />
			</AgreementProvider>
		</Suspense>
	);
}
