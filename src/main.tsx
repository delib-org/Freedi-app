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

// Log environment info
console.info('[Main] App starting, mode:', import.meta.env.MODE, 'dev:', import.meta.env.DEV, 'prod:', import.meta.env.PROD);

// Import debug utilities in development and testing
if (import.meta.env.DEV || import.meta.env.MODE === 'testing') {
	console.info('[Main] Loading debug utilities...');
	import('./utils/debugNotifications');
	import('./utils/notificationDebugger');
	import('./utils/testNotification');
	import('./utils/notificationStatus');
}

console.info('[Main] Initializing app... v.1.0.5');

const root = createRoot(document.getElementById('root')!);

root.render(
	<React.StrictMode>
		<Provider store={store}>
			<UserConfigProvider>
				<PWAWrapper>
					<RouterProvider router={router} />
				</PWAWrapper>
			</UserConfigProvider>
		</Provider>
	</React.StrictMode>
);
