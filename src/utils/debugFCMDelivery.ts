import { getMessaging, onMessage } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

export async function debugFCMDelivery() {
	console.info('%c=== FCM DELIVERY DEBUG ===', 'color: purple; font-weight: bold; font-size: 16px');

	const messaging = getMessaging(app);

	// 1. Monitor all FCM events
	console.info('Setting up FCM message listener...');
	onMessage(messaging, (payload) => {
		console.info(
			'%c[FCM MESSAGE RECEIVED]',
			'color: green; font-weight: bold',
			new Date().toISOString(),
		);
		console.info('Full payload:', JSON.stringify(payload, null, 2));
	});

	// 2. Monitor service worker events
	if ('serviceWorker' in navigator) {
		const sw = await navigator.serviceWorker.ready;

		// Listen for all messages from SW
		navigator.serviceWorker.addEventListener('message', (event) => {
			console.info('%c[SW MESSAGE]', 'color: blue; font-weight: bold', new Date().toISOString());
			console.info('Event data:', event.data);
		});

		// Check if SW is handling push events
		console.info('Checking service worker push support...');
		try {
			// Send a test message to SW
			sw.active?.postMessage({ type: 'CHECK_PUSH_SUPPORT' });
		} catch (error) {
			logError(error, {
				operation: 'utils.debugFCMDelivery.unknown',
				metadata: { message: 'SW communication error:' },
			});
		}
	}

	// 3. Monitor Push API directly
	if ('PushManager' in window) {
		console.info('Monitoring Push API...');
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			console.info('Push subscription active:', subscription.endpoint);

			// Check if the endpoint is valid
			const isGoogleEndpoint = subscription.endpoint.includes('fcm.googleapis.com');
			const isFirebaseEndpoint = subscription.endpoint.includes('firebase');
			console.info('Endpoint type:', { isGoogleEndpoint, isFirebaseEndpoint });
		}
	}

	// 4. Check for any console errors
	const originalError = console.error;
	console.error = function (...args) {
		if (
			args[0]?.toString().includes('FCM') ||
			args[0]?.toString().includes('push') ||
			args[0]?.toString().includes('notification')
		) {
			console.info('%c[FCM ERROR DETECTED]', 'color: red; font-weight: bold', ...args);
		}
		originalError.apply(console, args);
	};

	console.info(
		'%c=== Monitoring active. Send a test message from another browser ===',
		'color: purple; font-weight: bold',
	);
	console.info('Keep this tab open and watch for any messages or errors.');
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { debugFCMDelivery?: typeof debugFCMDelivery }).debugFCMDelivery = debugFCMDelivery;
}
