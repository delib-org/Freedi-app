import { getMessaging, onMessage } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

export function monitorNotifications() {
	// console.info('=== STARTING NOTIFICATION MONITOR ===');

	try {
		const messaging = getMessaging(app);

		// Monitor foreground messages
		onMessage(messaging, () => {
			// console.info('[FC MESSAGE]', { data: message });
		});
	} catch (error) {
		logError(error, { operation: 'utils.monitorNotifications.monitorNotifications', metadata: { message: 'Error setting up monitor:' } });
	}
}

// Also monitor service worker messages
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.addEventListener('message', () => {
		// Uncomment for debugging service worker messages
		// console.info('[SW MESSAGE]', { data: event.data });
	});
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { monitorNotifications?: typeof monitorNotifications }).monitorNotifications =
		monitorNotifications;

	// Auto-start monitoring
	// Run monitorNotifications() to start monitoring
}
