// Import the CSS first to ensure it loads quickly
import './view/style/style.scss';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import { router } from './routes/router';
import { UserConfigProvider } from './context/UserConfigContext';
import PWAWrapper from './view/components/pwa/PWAWrapper';
import { initSentry } from './services/monitoring/sentry';
import RootErrorBoundary from './components/ErrorBoundary/RootErrorBoundary';
import Clarity from '@microsoft/clarity';

// Initialize Sentry before anything else
initSentry();

// Initialize Microsoft Clarity
Clarity.init('vipo4d20gg');

// Initialize IndexedDB error handler early to catch connection errors
import { setupIndexedDBErrorHandler } from './utils/indexedDBErrorHandler';
import { isChunkLoadError, handleChunkLoadError } from './utils/errorBoundaryHelpers';

setupIndexedDBErrorHandler();

// Global handler for chunk loading errors (stale cache after deployment)
window.addEventListener('error', (event) => {
	if (event.error && isChunkLoadError(event.error)) {
		console.info('Chunk loading error detected (global handler), reloading...');
		event.preventDefault();
		handleChunkLoadError();
	}
});

window.addEventListener('unhandledrejection', (event) => {
	if (event.reason && isChunkLoadError(event.reason)) {
		console.info('Chunk loading promise rejection detected, reloading...');
		event.preventDefault();
		handleChunkLoadError();
	}
});

// Ensure Firebase service worker is registered
import './utils/ensureFirebaseServiceWorker';

// Import debug utilities in development and testing
if (import.meta.env.DEV || import.meta.env.MODE === 'testing') {
	import('./utils/testSentry');
	import('./utils/debugNotifications');
	import('./utils/notificationDebugger');
	import('./utils/testNotification');
	import('./utils/notificationStatus');
	import('./utils/debugGroupNotifications');
	import('./utils/debugDeploymentNotifications');
	import('./utils/debugServiceWorkers');
	import('./utils/debugChromeNotifications');
	import('./utils/monitorNotifications');
	import('./utils/debugFCMDelivery');
	import('./utils/testChromeDelivery');
	import('./utils/compareBrowserTokens');
	import('./utils/fixChromeServiceWorker');
	import('./utils/debugServiceWorkerScopes');
	import('./utils/monitorPushEvents');
}

export const AppVersion = '5.5.26'; // Update this version when making changes

const root = createRoot(document.getElementById('root')!);

root.render(
	<React.StrictMode>
		<RootErrorBoundary>
			<Provider store={store}>
				<UserConfigProvider>
					<PWAWrapper>
						<RouterProvider router={router} />
					</PWAWrapper>
				</UserConfigProvider>
			</Provider>
		</RootErrorBoundary>
	</React.StrictMode>,
);
