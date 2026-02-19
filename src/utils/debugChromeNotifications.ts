import { getMessaging, getToken } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';
import { logError } from '@/utils/errorHandling';

export async function debugChromeNotifications() {
	console.info(
		'%c=== CHROME NOTIFICATIONS DEBUG ===',
		'color: red; font-weight: bold; font-size: 16px',
	);

	// 1. Browser info
	console.info('%c1. Browser Information:', 'color: blue; font-weight: bold');
	const userAgent = navigator.userAgent;
	const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor);
	const isFirefox = /Firefox/.test(userAgent);
	const isSafari = /Safari/.test(userAgent) && /Apple Computer/.test(navigator.vendor);

	console.info('   - User Agent:', userAgent);
	console.info('   - Is Chrome:', isChrome);
	console.info('   - Is Firefox:', isFirefox);
	console.info('   - Is Safari:', isSafari);
	console.info('   - Browser:', getBrowserName());

	// 2. Check service worker
	console.info('%c2. Service Worker Registration:', 'color: blue; font-weight: bold');
	if ('serviceWorker' in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		const firebaseSW = registrations.find((r) =>
			r.active?.scriptURL.includes('firebase-messaging-sw.js'),
		);
		console.info('   - Firebase SW found:', !!firebaseSW);
		if (firebaseSW) {
			console.info('   - Scope:', firebaseSW.scope);
			console.info('   - State:', firebaseSW.active?.state);
		}
	}

	// 3. Try manual token generation
	console.info('%c3. Manual Token Generation Test:', 'color: blue; font-weight: bold');
	try {
		const messaging = getMessaging(app);
		console.info('   - Messaging instance created');
		console.info('   - VAPID key:', vapidKey ? 'Present' : 'Missing');
		console.info('   - VAPID key value:', vapidKey);

		// Try to get token directly
		const token = await getToken(messaging, {
			vapidKey: vapidKey,
			serviceWorkerRegistration: await navigator.serviceWorker.getRegistration(),
		});

		console.info('   - Token generated:', token ? 'Success' : 'Failed');
		console.info('   - Token:', token);

		// Compare with different VAPID key formats
		if (!token && vapidKey) {
			console.info('%c4. Testing VAPID Key Variants:', 'color: orange; font-weight: bold');

			// Try without any modifications
			try {
				const token2 = await getToken(messaging, { vapidKey });
				console.info('   - Direct VAPID:', token2 ? 'Success' : 'Failed');
			} catch (e) {
				logError(e, { operation: 'utils.debugChromeNotifications.vapidTest', metadata: { message: 'Direct VAPID error' } });
			}
		}
	} catch (error) {
		logError(error, { operation: 'utils.debugChromeNotifications.tokenGeneration', metadata: { name: (error as Error).name, message: (error as Error).message } });
	}

	// 4. Check Push API
	console.info('%c5. Push API Status:', 'color: blue; font-weight: bold');
	if ('PushManager' in window) {
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			console.info('   - Push subscription exists:', !!subscription);
			if (subscription) {
				console.info('   - Endpoint:', subscription.endpoint);
				console.info('   - Auth:', subscription.toJSON().keys?.auth);
				console.info('   - P256dh:', subscription.toJSON().keys?.p256dh);
			}
		} catch (error) {
			logError(error, { operation: 'utils.debugChromeNotifications.unknown', metadata: { message: '   - Push API error:' } });
		}
	}

	// 5. Chrome-specific checks
	if (isChrome) {
		console.info('%c6. Chrome-Specific Checks:', 'color: blue; font-weight: bold');

		// Check if notifications are blocked at Chrome level
		try {
			const permissionStatus = await navigator.permissions.query({
				name: 'notifications' as PermissionName,
			});
			console.info('   - Permission state:', permissionStatus.state);

			// Check Chrome flags
			console.info('   - Check chrome://flags for notification settings');
			console.info('   - Check chrome://settings/content/notifications');
		} catch (error) {
			logError(error, { operation: 'utils.debugChromeNotifications.unknown', metadata: { message: '   - Permission query error:' } });
		}
	}

	console.info('%c=== END DEBUG ===', 'color: red; font-weight: bold; font-size: 16px');
}

function getBrowserName() {
	const userAgent = navigator.userAgent;
	if (userAgent.includes('Firefox')) return 'Firefox';
	if (userAgent.includes('Chrome')) return 'Chrome';
	if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
	if (userAgent.includes('Edge')) return 'Edge';

	return 'Unknown';
}

// Add to window
if (typeof window !== 'undefined') {
	(
		window as { debugChromeNotifications?: typeof debugChromeNotifications }
	).debugChromeNotifications = debugChromeNotifications;
}
