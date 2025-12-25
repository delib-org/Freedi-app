import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { AgreementProvider } from './context/AgreementProvider';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import { useAuthRedirect } from './controllers/hooks/useAuthRedirect';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import Accessibility from './view/components/accessibility/Accessibility';
import { ListenerStats } from './view/components/ListenerStats';
import PWAInstallPrompt from './view/components/pwa/PWAInstallPrompt';
import { usePWAInstallPrompt } from './hooks/usePWAInstallPrompt';
import OfflineAlert from './view/components/offlineAlert/OfflineAlert';

export default function App() {
	const authState = useAuthentication();
	const { isLoading, user } = authState;

	// Handle auth-based navigation (redirects unauthenticated users)
	useAuthRedirect(authState);

	const { shouldShowPrompt, handleInstall, handleDismiss } = usePWAInstallPrompt();

	if (isLoading) {
		return <LoadingPage />;
	}

	return (
		<Suspense fallback={<LoadingPage />}>
			<Accessibility />
			<ListenerStats />
			<PWAInstallPrompt
				isVisible={shouldShowPrompt}
				onInstall={handleInstall}
				onDismiss={handleDismiss}
			/>
			<OfflineAlert />
			<AgreementProvider user={user}>
				<Outlet />
			</AgreementProvider>
		</Suspense>
	);
}
