import { notificationService } from '@/services/notificationService';
import { auth } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

export async function debugNotifications() {
	console.info('=== NOTIFICATION DEBUG START ===');

	// 0. Check environment variables
	console.info('0. Environment Variables:');
	console.info('   - NODE_ENV:', import.meta.env.MODE);
	console.info('   - DEV:', import.meta.env.DEV);
	console.info('   - PROD:', import.meta.env.PROD);
	console.info('   - VAPID Key exists:', !!import.meta.env.VITE_FIREBASE_VAPID_KEY);
	console.info(
		'   - VAPID Key length:',
		import.meta.env.VITE_FIREBASE_VAPID_KEY ? import.meta.env.VITE_FIREBASE_VAPID_KEY.length : 0,
	);
	console.info('   - Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID || 'NOT SET');

	// 1. Check browser support
	console.info('\n1. Browser Support:');
	console.info('   - Service Worker:', 'serviceWorker' in navigator);
	console.info('   - Notifications:', 'Notification' in window);
	console.info('   - Push API:', 'PushManager' in window);

	// 2. Check permissions
	console.info('\n2. Permissions:');
	console.info('   - Notification permission:', Notification.permission);

	// 3. Check service workers
	console.info('\n3. Service Workers:');
	if ('serviceWorker' in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		console.info('   - Total registrations:', registrations.length);

		for (const reg of registrations) {
			console.info(`   - SW: ${reg.scope}`);
			console.info(`     Active: ${reg.active ? 'Yes' : 'No'}`);
			console.info(`     URL: ${reg.active?.scriptURL}`);

			// Check push subscription
			if (reg.pushManager) {
				try {
					const subscription = await reg.pushManager.getSubscription();
					console.info(`     Push subscription: ${subscription ? 'Yes' : 'No'}`);
					if (subscription) {
						console.info(`     Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
					}
				} catch (e) {
					logError(e, { operation: 'utils.debugNotifications.unknown', metadata: { message: '     Push subscription error:' } });
				}
			}
		}

		// Check specific Firebase SW
		const firebaseSW = registrations.find((r) =>
			r.active?.scriptURL.includes('firebase-messaging-sw.js'),
		);
		if (!firebaseSW) {
			console.info('   ⚠️  Firebase messaging SW not found!');
		} else {
			console.info('   ✅ Firebase messaging SW is active');
		}
	}

	// 4. Check FCM token
	console.info('\n4. FCM Token:');
	const token = notificationService.getToken();
	if (token) {
		console.info('   - Token exists:', token.substring(0, 20) + '...');
		console.info('   - Full token for verification:', token);
	} else {
		console.info('   - ❌ No FCM token found');
	}

	// 5. Check current user
	console.info('\n5. Current User:');
	const user = auth.currentUser;
	if (user) {
		console.info('   - User ID:', user.uid);
		console.info('   - Email:', user.email);
	} else {
		console.info('   - ❌ No user logged in');
	}

	// 6. Test local notification
	console.info('\n6. Testing local notification...');
	if (Notification.permission === 'granted') {
		try {
			const notification = new Notification('Debug Test', {
				body: 'If you see this, local notifications work!',
				icon: '/icons/logo-192px.png',
			});
			console.info('   - ✅ Local notification created');

			setTimeout(() => notification.close(), 5000);
		} catch (e) {
			logError(e, { operation: 'utils.debugNotifications.unknown', metadata: { message: '   - ❌ Local notification error:' } });
		}
	} else {
		console.info('   - ❌ Permission not granted');
	}

	// 7. Get diagnostics
	console.info('\n7. Notification Service Diagnostics:');
	try {
		const diagnostics = await notificationService.getDiagnostics();
		console.info('   - Diagnostics:', diagnostics);
	} catch (e) {
		logError(e, { operation: 'utils.debugNotifications.unknown', metadata: { message: '   - Error getting diagnostics:' } });
	}

	console.info('\n=== NOTIFICATION DEBUG END ===');

	// Return summary
	const allRegistrations =
		'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];

	return {
		hasServiceWorker: 'serviceWorker' in navigator,
		hasNotificationAPI: 'Notification' in window,
		permission: Notification.permission,
		hasToken: !!token,
		token: token,
		userId: user?.uid,
		firebaseSWActive: allRegistrations.some((r) =>
			r.active?.scriptURL.includes('firebase-messaging-sw.js'),
		),
	};
}

// Add to window for easy console access
if (typeof window !== 'undefined') {
	(window as { debugNotifications?: typeof debugNotifications }).debugNotifications =
		debugNotifications;
}
