// Handle notification click
self.addEventListener('notificationclick', function (event) {
	// We own the click destination; prevent Firebase from also opening a window.
 event.stopImmediatePropagation();

	// Close the notification
	event.notification.close();

	// Get notification data
	const rawData = event.notification.data || {};
 const data = rawData.FCM_MSG?.data || rawData;
	const url = data.url || '/';
	const notificationId = data.notificationId;

	// Opening one notification must not clear the other unread updates.
	// The authenticated feed reconciles the badge after the app opens.

	// Handle action buttons - simplified to just 'open' since we removed 'dismiss'
	let actionUrl = data.notificationType === 'statement_reply' && data.parentId ? `/statement/${encodeURIComponent(data.parentId)}?tab=chat#${encodeURIComponent(data.statementId || '')}` : url;
	if (event.action === 'open' && data.openUrl) {
		actionUrl = data.openUrl;
	}

	try { const target = new URL(actionUrl, self.location.origin); actionUrl = target.origin === self.location.origin ? target.href : self.location.origin + '/home'; } catch { actionUrl = self.location.origin + '/home'; }

	// Main notification click logic
	event.waitUntil(
		(async () => {
			try {
				// Clean up old notifications from cache (older than 1 day)
				const now = new Date().getTime();
				for (const [key, value] of notificationCache.entries()) {
					if (now - value.timestamp > 24 * 60 * 60 * 1000) {
						notificationCache.delete(key);
					}
				}

				// Try to find an existing window and focus it
				const allClients = await clients.matchAll({
					type: 'window',
					includeUncontrolled: true
				});

				// Check if we already have a window open
				for (const client of allClients) {
					// If we find a client with the same URL, focus it
					if (client.url === actionUrl) {
						await client.focus();
						// Post a message to the client with notification data
						if (notificationId && notificationCache.has(notificationId)) {
							client.postMessage({
								type: 'NOTIFICATION_CLICKED',
								payload: notificationCache.get(notificationId)
							});
						}
						return;
					}
				}

				// If no matching window found, open a new one
				const client = await clients.openWindow(actionUrl);
				if (client && notificationId && notificationCache.has(notificationId)) {
					// Wait a moment for client to initialize
					setTimeout(() => {
						client.postMessage({
							type: 'NOTIFICATION_CLICKED',
							payload: notificationCache.get(notificationId)
						});
					}, 1000);
				}
			} catch (error) {
				console.error('Error handling notification click:', error);
			}
		})()
	);
});


importScripts('/badge-store.js');
// Import latest Firebase scripts
importScripts(
	"https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"
);
importScripts(
	"https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js"
);

// Initialize the Firebase app in the service worker with build-time config
const currentDomain = self.location.hostname;
let messaging = null;

const fallbackConfig = (() => {
	if (currentDomain === 'freedi.tech' || currentDomain === 'delib.web.app' || currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
		return {
			apiKey: "AIzaSyBEumZUTCL3Jc9pt7_CjiSVTxmz9aMqSvo",
			authDomain: "synthesistalyaron.firebaseapp.com",
			databaseURL: "https://synthesistalyaron.firebaseio.com",
			projectId: "synthesistalyaron",
			storageBucket: "synthesistalyaron.appspot.com",
			messagingSenderId: "799655218679",
			appId: "1:799655218679:web:1409dd5e3b4154ecb9b2f2",
			measurementId: "G-XSGFFBXM9X",
		};
	}

	if (currentDomain === 'freedi-test.web.app') {
		return {
			apiKey: 'AIzaSyBCgq3y9WjS8ZkB-q_lnkFM2BuUdLp2M-g',
			authDomain: 'freedi-test.firebaseapp.com',
			projectId: 'freedi-test',
			storageBucket: 'freedi-test.firebasestorage.app',
			messagingSenderId: '47037334917',
			appId: '1:47037334917:web:f9bce2dd772b5efd29f0ec'
		};
	}

	if (currentDomain === 'wizcol-app.web.app' || currentDomain === 'app.wizcol.com' || currentDomain.endsWith('.wizcol.com') || currentDomain === 'wizcol.com') {
		return {
			apiKey: 'AIzaSyBtm5USTMMQqf9KQ3ZIne6VbZ6AGOiT-Ts',
			authDomain: 'wizcol-app.firebaseapp.com',
			projectId: 'wizcol-app',
			storageBucket: 'wizcol-app.firebasestorage.app',
			messagingSenderId: '337833396726',
			appId: '1:337833396726:web:b80268707145886ce95fd7'
		};
	}

	console.warn('Using fallback config for unknown domain:', currentDomain);
	return {
		apiKey: 'AIzaSyBCgq3y9WjS8ZkB-q_lnkFM2BuUdLp2M-g',
		authDomain: 'freedi-test.firebaseapp.com',
		projectId: 'freedi-test',
		storageBucket: 'freedi-test.firebasestorage.app',
		messagingSenderId: '47037334917',
		appId: '1:47037334917:web:f9bce2dd772b5efd29f0ec'
	};
})();

// Cache for storing notification data
const notificationCache = new Map();



const setupMessagingHandlers = (messagingInstance) => {
	messaging = messagingInstance;

	// Set up background message handler AFTER messaging is initialized
	messaging.onBackgroundMessage(async function (payload) {
		try {
			// Received background message

			// If there's no notification object, we can't show a notification
			if (!payload.notification && !payload.data?.title) {
				console.error('No notification data in payload');
				return;
			}

			const { title, body, image } = payload.notification || payload.data;
			const data = payload.data || {};

			// Generate a unique ID for this notification if not provided
			const notificationId = data.notificationId || data.id || (data.statementId ? `statement:${data.statementId}` : payload.messageId);

			// Store notification data in cache for access when user clicks
			notificationCache.set(notificationId, {
				...payload,
				timestamp: new Date().getTime()
			});

			// Default URL to open when notification is clicked
			const url = data.url || (data.parentId ? `/statement/${encodeURIComponent(data.parentId)}?tab=chat#${encodeURIComponent(data.statementId || '')}` : '/home');

			// Enhanced notification options
			const notificationOptions = {
				body: body || '',
				icon: '/icons/logo-192px.png', // Local app icon
				badge: '/icons/logo-48px.png', // Badge icon
				image: image || '', // Large image if provided
				vibrate: [100, 50, 100, 50, 100], // Vibration pattern
				sound: '/assets/sounds/bell.mp3', // Sound file
				tag: data.tag || `statement-${data.parentId || notificationId}`, // Group similar notifications
				data: {
					...data,
					notificationId,
					url
				},
				// Only show a single action button to prevent duplicate notifications with different buttons
				actions: [
					{
						action: 'open',
						title: data.openActionTitle || 'Open'
					}
				],
				// Make notification require interaction (won't auto-dismiss)
				requireInteraction: data.requireInteraction !== 'false',
				// Timestamp when notification was received
				timestamp: new Date().getTime(),
				// Direction for text (useful for RTL languages)
				dir: data.dir || 'auto',
				// Controls notification appearance in Android
				android: {
					style: 'bigtext',
					priority: 'high',
					channelId: data.channelId || 'default'
				}
			};

   // Read the latest persisted baseline on every push, never an in-memory counter.
   try {
    const badge = await FreeDiBadgeStore.update({ notificationId });
    if (badge.signedOut) return;
    await FreeDiBadgeStore.apply(badge.count);
   } catch (error) { console.info('[push] Badge storage unavailable', error); }

			// Show the notification
			// Firebase automatically displays notification payloads. Only data-only
   // messages need a manual notification, otherwise users get two alerts.
   if (!payload.notification) await self.registration.showNotification(title || 'WizCol', notificationOptions);

			// Try to play sound (though this typically won't work in service worker)
			await playNotificationSound();

			// Notification displayed successfully
			console.info('[firebase-messaging-sw] Notification shown:', title);
		} catch (error) {
			console.error('Error showing notification:', error);
		}
	});

	console.info('[firebase-messaging-sw] Messaging handlers initialized');
};

const initializeFirebase = () => {
	try {
		const firebaseConfig = fallbackConfig;
		firebase.initializeApp(firebaseConfig);
		setupMessagingHandlers(firebase.messaging());
		console.info('[firebase-messaging-sw] Firebase initialized successfully');
	} catch (error) {
		console.error('[firebase-messaging-sw] Failed to initialize Firebase:', error);
	}
};

// Initialize Firebase immediately
initializeFirebase();

// Add push event listener for debugging
self.addEventListener('push', function(event) {
	// Push event received
	
	// Log the push event details
	if (event.data) {
		try {
			const data = event.data.json();
			// Push JSON data received
			
			// Send message to main thread
			self.clients.matchAll().then(clients => {
				clients.forEach(client => {
					client.postMessage({
						type: 'PUSH_RECEIVED',
						data: data,
						timestamp: new Date().toISOString()
					});
				});
			});
		} catch (e) {
			// Push text data received
		}
	} else {
		// No push data in event
	}
	
	// Let Firebase handle the push event as well
	// The onBackgroundMessage handler will be called after this
});

// Function to play notification sound
const playNotificationSound = async () => {
	// This won't work in the service worker context, but we'll leave it for reference
	try {
		await self.clients.matchAll().then(clients => {
			if (clients.length > 0) {
				// Send a message to the client to play the sound
				clients[0].postMessage({
					type: 'PLAY_NOTIFICATION_SOUND'
				});
			}
		});
	} catch (error) {
		console.error('Error playing notification sound:', error);
	}
};

// Listen for messages from the main app
self.addEventListener('message', (event) => {

	// Handle push support check
	if (event.data && event.data.type === 'CHECK_PUSH_SUPPORT') {
		// Use ports if available for proper response
		if (event.ports && event.ports[0]) {
			event.ports[0].postMessage({
				type: 'PUSH_SUPPORT_RESPONSE',
				supported: true,
				messaging: !!messaging,
				pushManager: 'PushManager' in self
			});
		}
		return;
	}

	if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
		// Wrap async operations in waitUntil to prevent early termination
		event.waitUntil(
			(async () => {
				try {
					// Clear all displayed notifications only
					// Badge count is managed by the app's Redux state via useBadgeSync
					const notifications = await self.registration.getNotifications();
					notifications.forEach(notification => notification.close());

					// Send confirmation back if ports are available
					if (event.ports && event.ports[0]) {
						event.ports[0].postMessage({
							type: 'CLEAR_NOTIFICATIONS_RESPONSE',
							success: true
						});
					}
				} catch (error) {
					console.error('Error clearing notifications:', error);
					// Send error back if ports are available
					if (event.ports && event.ports[0]) {
						event.ports[0].postMessage({
							type: 'CLEAR_NOTIFICATIONS_RESPONSE',
							success: false,
							error: error.message
						});
					}
				}
			})()
		);
	}
});
