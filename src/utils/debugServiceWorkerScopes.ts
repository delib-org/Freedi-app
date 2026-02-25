import { logError } from '@/utils/errorHandling';

export async function debugServiceWorkerScopes() {
	console.info(
		'%c=== SERVICE WORKER SCOPE DEBUG ===',
		'color: purple; font-weight: bold; font-size: 16px',
	);

	const registrations = await navigator.serviceWorker.getRegistrations();

	console.info(`Found ${registrations.length} service worker registrations:\n`);

	registrations.forEach((reg, index) => {
		console.info(`%cRegistration ${index + 1}:`, 'color: blue; font-weight: bold');
		console.info('  Scope:', reg.scope);
		console.info(
			'  Script URL:',
			reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || 'None',
		);
		console.info('  State:', reg.active?.state || 'No active worker');
		console.info('  Update state:', reg.updateViaCache);

		// Check for Firebase messaging SW
		const scriptURL = reg.active?.scriptURL || '';
		if (scriptURL.includes('firebase-messaging-sw.js')) {
			console.info('  %c✅ This is the Firebase Messaging SW', 'color: green');
		} else if (scriptURL.includes('sw.js')) {
			console.info('  %c📦 This is the PWA/Vite SW', 'color: orange');
		}

		console.info('---');
	});

	// Check for scope conflicts
	const scopes = registrations.map((r) => r.scope);
	const duplicateScopes = scopes.filter((scope, index) => scopes.indexOf(scope) !== index);

	if (duplicateScopes.length > 0) {
		logError(new Error('%c⚠️ Scope conflict detected!'), {
			operation: 'utils.debugServiceWorkerScopes.duplicateScopes',
			metadata: { detail: 'color: red; font-weight: bold' },
		});
		logError(duplicateScopes, {
			operation: 'utils.debugServiceWorkerScopes.duplicateScopes',
			metadata: { message: 'Duplicate scopes:' },
		});
		logError(new Error('This can prevent service workers from working correctly.'), {
			operation: 'utils.debugServiceWorkerScopes.duplicateScopes',
		});
	}

	// Check controller
	console.info('\n%cActive Controller:', 'color: blue; font-weight: bold');
	if (navigator.serviceWorker.controller) {
		console.info('  Script URL:', navigator.serviceWorker.controller.scriptURL);
		console.info('  State:', navigator.serviceWorker.controller.state);
	} else {
		logError(new Error('  No active controller'), {
			operation: 'utils.debugServiceWorkerScopes.duplicateScopes',
		});
	}

	// Recommendation
	console.info('\n%cRecommendation:', 'color: green; font-weight: bold');
	const hasFirebaseSW = registrations.some((r) =>
		(r.active?.scriptURL || '').includes('firebase-messaging-sw.js'),
	);

	if (!hasFirebaseSW) {
		logError(new Error('Firebase Messaging SW is missing! Run fixChromeServiceWorker()'), {
			operation: 'utils.debugServiceWorkerScopes.checkScopes',
		});
	} else if (scopes.filter((s) => s.endsWith('/')).length > 1) {
		logError(new Error('⚠️ Multiple SWs with root scope. Consider using different scopes.'), {
			operation: 'utils.debugServiceWorkerScopes.hasFirebaseSW',
		});
	} else {
		console.info('✅ Service workers are properly configured');
	}

	console.info('\n%c=== END DEBUG ===', 'color: purple; font-weight: bold');
}

// Add to window
if (typeof window !== 'undefined') {
	(
		window as { debugServiceWorkerScopes?: typeof debugServiceWorkerScopes }
	).debugServiceWorkerScopes = debugServiceWorkerScopes;
}
