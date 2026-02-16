import { logger } from '@/services/logger';

export function monitorPushEvents() {
	console.info('=== MONITORING PUSH EVENTS ===');
	console.info('Listening for push events in both main thread and service worker...\n');

	let eventCount = 0;

	// Monitor service worker messages
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.addEventListener('message', (event) => {
			eventCount++;
			console.info(`[Event ${eventCount}] Service Worker Message`);
			console.info('Time:', { timestamp: new Date().toISOString() });
			console.info('Data:', { data: event.data });

			if (event.data?.type === 'PUSH_RECEIVED') {
				console.info('🔔 PUSH NOTIFICATION RECEIVED!');
				console.info('Push data:', { data: event.data.data });
			}

			console.info('---\n');
		});
	}

	// Monitor for notification events
	if ('Notification' in window) {
		// Override Notification constructor to log when notifications are created
		const OriginalNotification = window.Notification;
		// @ts-ignore
		window.Notification = function (...args) {
			eventCount++;
			console.info(`[Event ${eventCount}] Notification Created`);
			console.info('Title:', { title: args[0] });
			console.info('Options:', { options: args[1] });
			console.info('---\n');

			// @ts-ignore
			return new OriginalNotification(...args);
		};
		// Copy static properties
		Object.setPrototypeOf(window.Notification, OriginalNotification);
		Object.setPrototypeOf(window.Notification.prototype, OriginalNotification.prototype);
	}

	// Check service worker state
	navigator.serviceWorker.getRegistrations().then((registrations) => {
		console.info('Service Worker Status:');
		registrations.forEach((reg) => {
			if (reg.active?.scriptURL.includes('firebase-messaging-sw.js')) {
				console.info('✅ Firebase SW: Active');

				// Check if we can communicate with it
				const channel = new MessageChannel();
				channel.port1.onmessage = (e) => {
					console.info('✅ Firebase SW responded:', { data: e.data });
				};

				reg.active.postMessage({ type: 'PING' }, [channel.port2]);
			}
		});
		logger.info('---\n');
	});

	console.info('Monitor is active. When a push notification is sent:');
	console.info('1. You should see "PUSH NOTIFICATION RECEIVED" in green');
	console.info("2. If you don't see anything, Chrome is not receiving push events");
	console.info('3. Keep this tab open and visible\n');
}

// Add to window
if (typeof window !== 'undefined') {
	(window as { monitorPushEvents?: typeof monitorPushEvents }).monitorPushEvents =
		monitorPushEvents;
}
