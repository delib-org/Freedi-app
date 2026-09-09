import './view/style/style.scss';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Provider } from 'react-redux';
import { loadLanguageData, DEFAULT_LANGUAGE, isValidLanguage } from '@freedi/shared-i18n';
import { store } from './redux/store';
import { router } from './routes/router';
import { UserConfigProvider } from './context/UserConfigContext';
import { AuthStateProvider } from './context/AuthStateContext';
import PWAWrapper from './view/components/pwa/PWAWrapper';
import { initSentry } from './services/monitoring/sentry';
import RootErrorBoundary from './components/ErrorBoundary/RootErrorBoundary';
import { schedulePrefetchLazyRoutes } from './routes/prefetchRoutes';
import { LocalStorageObjects } from './types/localStorage/LocalStorageObjects';
import { setupIndexedDBErrorHandler } from './utils/indexedDBErrorHandler';
import { isChunkLoadError, handleChunkLoadError } from './utils/errorBoundaryHelpers';

const materialSymbols = document.createElement('link');
materialSymbols.rel = 'stylesheet';
materialSymbols.href =
	'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0';
document.head.append(materialSymbols);

try {
	const savedConfig = localStorage.getItem(LocalStorageObjects.UserConfig);
	const parsed: { chosenLanguage?: string } = savedConfig ? JSON.parse(savedConfig) : {};
	const lang = parsed.chosenLanguage;
	void loadLanguageData(lang && isValidLanguage(lang) ? lang : DEFAULT_LANGUAGE);
} catch {
	void loadLanguageData(DEFAULT_LANGUAGE);
}

initSentry();
setupIndexedDBErrorHandler();

window.addEventListener('error', (event) => {
	if (event.error && isChunkLoadError(event.error)) {
		event.preventDefault();
		handleChunkLoadError();
	}
});

window.addEventListener('unhandledrejection', (event) => {
	if (event.reason && isChunkLoadError(event.reason)) {
		event.preventDefault();
		handleChunkLoadError();
	}
});

const runWhenIdle = (callback: () => void): void => {
	if (typeof window.requestIdleCallback === 'function') {
		window.requestIdleCallback(() => callback(), { timeout: 5000 });
	} else {
		window.setTimeout(callback, 1500);
	}
};

runWhenIdle(() => {
	import('@microsoft/clarity')
		.then((module) => module.default.init('vipo4d20gg'))
		.catch(() => undefined);
	import('./utils/ensureFirebaseServiceWorker').catch(() => undefined);
});

schedulePrefetchLazyRoutes();

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

export const AppVersion = '5.5.28';

createRoot(document.getElementById('root')!).render(
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
