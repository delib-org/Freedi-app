import { getMessaging, getToken, deleteToken } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';

export async function testChromeDelivery() {
	console.info('=== CHROME DELIVERY TEST ===');

	const messaging = getMessaging(app);

	// 1. Force regenerate token
	console.info('1. Regenerating FCM token...');
	try {
		// Delete existing token
		await deleteToken(messaging);
		console.info('   - Old token deleted');

		// Get new token
		const newToken = await getToken(messaging, { vapidKey });
		console.info('   - New token generated:', { result: newToken ? 'Success' : 'Failed' });
		if (newToken) {
			console.info('   - Token:', { token: newToken });
			console.info('   - Copy this token for testing');
		}
	} catch (error) {
		console.error('Token regeneration error:', error);
	}

	// 2. Check service worker
	console.info('\n2. Checking service worker...');
	const registrations = await navigator.serviceWorker.getRegistrations();
	const firebaseSW = registrations.find((r) =>
		r.active?.scriptURL.includes('firebase-messaging-sw.js'),
	);

	if (firebaseSW) {
		console.info('   - Firebase SW found and active');
		console.info('   - Sending test message to SW...');

		// Create a message channel for response
		const channel = new MessageChannel();
		channel.port1.onmessage = (event) => {
			console.info('   - SW Response:', { data: event.data });
		};

		firebaseSW.active?.postMessage({ type: 'CHECK_PUSH_SUPPORT' }, [channel.port2]);
	} else {
		console.error('   - Firebase SW NOT FOUND!');
	}

	// 3. Test direct push subscription
	console.info('\n3. Testing Push API directly...');
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			console.info('   - Push subscription active');
			console.info('   - Endpoint:', { endpoint: subscription.endpoint });

			// Check if it's a valid FCM endpoint
			const isFCMEndpoint = subscription.endpoint.includes('fcm.googleapis.com');
			console.info('   - Is FCM endpoint:', { isFCMEndpoint });

			if (!isFCMEndpoint) {
				console.error('   - WARNING: Not an FCM endpoint!');
			}
		} else {
			console.error('   - No push subscription found!');

			// Try to create one
			console.info('   - Attempting to create push subscription...');
			const newSub = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: vapidKey,
			});
			console.info('   - New subscription created:', { endpoint: newSub.endpoint });
		}
	} catch (error) {
		console.error('Push API error:', error);
	}

	// 4. Listen for any push events
	console.info('\n4. Setting up push event listeners...');

	// Listen for messages from service worker
	navigator.serviceWorker.addEventListener('message', (event) => {
		console.info('[SW->Main Message]', { timestamp: new Date().toISOString(), data: event.data });
	});

	// Monitor console for push events
	// eslint-disable-next-line no-console
	const originalLog = console.log;
	// eslint-disable-next-line no-console
	console.log = function (...args) {
		if (
			args.some(
				(arg) =>
					String(arg).toLowerCase().includes('push') || String(arg).toLowerCase().includes('fcm'),
			)
		) {
			originalLog.call(console, '[Intercepted Push Log]', ...args);
		} else {
			originalLog.apply(console, args);
		}
	};

	console.info('\n=== Test Setup Complete ===');
	console.info('Now have Firefox send a message and watch for any activity above.');
	console.info('If nothing appears, Chrome is not receiving push events at all.');
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { testChromeDelivery?: typeof testChromeDelivery }).testChromeDelivery =
		testChromeDelivery;
}
