// Import the CSS first to ensure it loads quickly
import './view/style/style.scss';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import { router } from './routes/router';
import { UserConfigProvider } from './context/UserConfigContext';
import { AuthStateProvider } from './context/AuthStateContext';
import PWAWrapper from './view/components/pwa/PWAWrapper';
import { initSentry } from './services/monitoring/sentry';
import RootErrorBoundary from './components/ErrorBoundary/RootErrorBoundary';
import { schedulePrefetchLazyRoutes } from './routes/prefetchRoutes';
import { loadLanguageData, DEFAULT_LANGUAGE, isValidLanguage } from '@freedi/shared-i18n';
import { LocalStorageObjects } from './types/localStorage/LocalStorageObjects';

// Start downloading the current language's dictionary chunk immediately,
// in parallel with the rest of app boot (UserConfigProvider awaits the same cached promise)
try {
	const savedConfig = localStorage.getItem(LocalStorageObjects.UserConfig);
	const parsed: { chosenLanguage?: string } = savedConfig ? JSON.parse(savedConfig) : {};
	const lang = parsed.chosenLanguage;
	void loadLanguageData(lang && isValidLanguage(lang) ? lang : DEFAULT_LANGUAGE);
} catch {
	void loadLanguageData(DEFAULT_LANGUAGE);
}

// Initialize Sentry before anything else
initSentry();

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

// Defer non-critical startup work until the browser is idle (after first paint)
const runWhenIdle = (callback: () => void): void => {
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(() => callback(), { timeout: 5000 });
	} else {
		window.setTimeout(callback, 1500);
	}
};

runWhenIdle(() => {
	// Microsoft Clarity analytics — not needed for first paint
	import('@microsoft/clarity')
		.then((module) => module.default.init('vipo4d20gg'))
		.catch(() => undefined);

	// Firebase messaging service worker registration + monitor (self-executes on import)
	import('./utils/ensureFirebaseServiceWorker').catch(() => undefined);
});

// Warm the lazy route chunks during idle time so later navigations are instant
schedulePrefetchLazyRoutes();

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
					<AuthStateProvider>
						<PWAWrapper>
							<RouterProvider router={router} />
						</PWAWrapper>
					</AuthStateProvider>
				</UserConfigProvider>
			</Provider>
		</RootErrorBoundary>
	</React.StrictMode>,
);
