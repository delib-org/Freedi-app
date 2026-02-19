import { logError } from '@/utils/errorHandling';
// Removed unused imports

export async function testNotificationSend() {
	console.info('=== TEST NOTIFICATION SEND ===');

	try {
		// First, check if we have notification permission
		if (Notification.permission !== 'granted') {
			logError(new Error('Notification permission not granted'), { operation: 'utils.testNotification.testNotificationSend' });

			return;
		}

		// Option 1: Send a test notification via service worker
		console.info('Sending local test notification...');
		if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage({
				type: 'TEST_NOTIFICATION',
				payload: {
					title: 'Test Notification',
					body: 'This is a test notification from the client',
					data: {
						timestamp: new Date().toISOString(),
					},
				},
			});
		}

		// Option 2: Show notification directly
		if (Notification.permission === 'granted') {
			const registration = await navigator.serviceWorker.ready;
			await registration.showNotification('Direct Test Notification', {
				body: 'This notification was triggered directly from the client',
				icon: '/icons/logo-192px.png',
				badge: '/icons/logo-48px.png',
				tag: 'test-' + Date.now(),
				requireInteraction: true,
			});
			console.info('✅ Direct notification sent');
		}

		console.info('=== TEST COMPLETE ===');
		console.info('Check if you received the notifications.');
		console.info('If not, check:');
		console.info('1. Browser notification settings');
		console.info('2. System notification settings');
		console.info('3. Do Not Disturb mode');
	} catch (error) {
		logError(error, { operation: 'utils.testNotification.unknown', metadata: { message: 'Error testing notification:' } });
	}
}

// Add to window for easy access
if (typeof window !== 'undefined') {
	(window as { testNotificationSend?: typeof testNotificationSend }).testNotificationSend =
		testNotificationSend;
}
