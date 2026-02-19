import { logError } from '@/utils/errorHandling';
export async function fixChromeServiceWorker() {
	console.info(
		'%c=== FIXING CHROME SERVICE WORKER ===',
		'color: red; font-weight: bold; font-size: 20px',
	);

	// 1. Check current registrations
	console.info('1. Current Service Worker Registrations:');
	const registrations = await navigator.serviceWorker.getRegistrations();

	registrations.forEach((reg, index) => {
		console.info(`   Registration ${index + 1}:`);
		console.info('   - Scope:', reg.scope);
		console.info(
			'   - Script:',
			reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || 'None',
		);
		console.info('   - State:', reg.active?.state || 'No active worker');
	});

	// 2. Look for Firebase SW
	const firebaseSW = registrations.find(
		(r) =>
			r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
			r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
			r.waiting?.scriptURL.includes('firebase-messaging-sw.js'),
	);

	if (!firebaseSW) {
		logError(new Error('❌ Firebase messaging service worker NOT FOUND!'), { operation: 'utils.fixChromeServiceWorker.firebaseSW' });

		// 3. Try to register it manually
		console.info('\n2. Attempting to register Firebase SW manually...');
		try {
			const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
				scope: '/firebase-messaging-sw/',
			});

			console.info('✅ Firebase SW registered successfully!');
			console.info('   - Scope:', reg.scope);

			// Wait for it to activate
			if (reg.installing) {
				console.info('   - Installing...');
				await new Promise((resolve) => {
					reg.installing!.addEventListener('statechange', function () {
						if (this.state === 'activated') {
							resolve(true);
						}
					});
				});
			}

			if (reg.active) {
				console.info('   - Active and ready!');
			}

			// 4. Test push subscription
			console.info('\n3. Testing push subscription...');
			const subscription = await reg.pushManager.getSubscription();
			if (subscription) {
				console.info('✅ Push subscription exists:', subscription.endpoint);
			} else {
				console.info('⚠️ No push subscription, creating one...');
				// Import VAPID key
				const { vapidKey } = await import('@/controllers/db/configKey');
				const newSub = await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: vapidKey,
				});
				console.info('✅ New push subscription created:', newSub.endpoint);
			}

			// 5. Force FCM to reinitialize
			console.info('\n4. Reinitializing FCM...');
			const { getMessaging, getToken, deleteToken } = await import('firebase/messaging');
			const { app } = await import('@/controllers/db/config');
			const { vapidKey } = await import('@/controllers/db/configKey');

			const messaging = getMessaging(app);

			// Delete and regenerate token
			try {
				await deleteToken(messaging);
				console.info('   - Old token deleted');
			} catch {
				console.info('   - No old token to delete');
			}

			const newToken = await getToken(messaging, {
				vapidKey,
				serviceWorkerRegistration: reg,
			});

			if (newToken) {
				console.info('✅ New FCM token generated:', newToken);
				console.info('\n5. Next steps:');
				console.info('   1. Refresh the page');
				console.info('   2. Have Firefox send a test message');
				console.info('   3. Check if notifications work now');
			} else {
				logError(new Error('❌ Failed to generate new token'), { operation: 'utils.fixChromeServiceWorker.unknown' });
			}
		} catch (error) {
			logError(error, { operation: 'utils.fixChromeServiceWorker.registerSW', metadata: { name: (error as Error).name, message: (error as Error).message } });
		}
	} else {
		console.info('✅ Firebase SW is already registered');
		console.info('   - Scope:', firebaseSW.scope);
		console.info('   - State:', firebaseSW.active?.state);

		// Check if it's the correct one
		if (!firebaseSW.active?.scriptURL.includes('/firebase-messaging-sw.js')) {
			logError(new Error('⚠️ Firebase SW URL looks incorrect:'), { operation: 'utils.fixChromeServiceWorker.unknown', metadata: { detail: firebaseSW.active?.scriptURL } });
		}
	}

	console.info('\n%c=== END FIX ===', 'color: red; font-weight: bold; font-size: 16px');
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { fixChromeServiceWorker?: typeof fixChromeServiceWorker }).fixChromeServiceWorker =
		fixChromeServiceWorker;
}
