// Import latest Firebase scripts
importScripts(
	"https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"
);
importScripts(
	"https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js"
);

// Initialize the Firebase app in the service worker with the production configuration
// First, determine the current domain
const currentDomain = self.location.hostname;
console.info('Current domain detected:', currentDomain);

// Select Firebase config based on the domain
let firebaseConfig;
if (currentDomain === 'freedi.tech' || currentDomain === 'delib.web.app') {
	// Development config
	firebaseConfig = {
		apiKey: "AIzaSyBEumZUTCL3Jc9pt7_CjiSVTxmz9aMqSvo",
		authDomain: "synthesistalyaron.firebaseapp.com",
		databaseURL: "https://synthesistalyaron.firebaseio.com",
		projectId: "synthesistalyaron",
		storageBucket: "synthesistalyaron.appspot.com",
		messagingSenderId: "799655218679",
		appId: "1:799655218679:web:1409dd5e3b4154ecb9b2f2",
		measurementId: "G-XSGFFBXM9X",
	};
} else if (currentDomain === 'freedi-test.web.app') {
	// Production config
	firebaseConfig = {
		apiKey: 'AIzaSyBCgq3y9WjS8ZkB-q_lnkFM2BuUdLp2M-g',
		authDomain: 'freedi-test.firebaseapp.com',
		projectId: 'freedi-test',
		storageBucket: 'freedi-test.firebasestorage.app',
		messagingSenderId: '47037334917',
		appId: '1:47037334917:web:f9bce2dd772b5efd29f0ec'
	};
} else {
	// Fallback or staging config
	console.warn('Using fallback config for unknown domain:', currentDomain);
	firebaseConfig = {
		// Use your fallback configuration here
		apiKey: 'AIzaSyBCgq3y9WjS8ZkB-q_lnkFM2BuUdLp2M-g',
		authDomain: 'freedi-test.firebaseapp.com',
		projectId: 'freedi-test',
		storageBucket: 'freedi-test.firebasestorage.app',
		messagingSenderId: '47037334917',
		appId: '1:47037334917:web:f9bce2dd772b5efd29f0ec'
	};
}

// Initialize Firebase

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Cache for storing notification data
const notificationCache = new Map();

// Badge counter in IndexedDB to persist across refreshes
let badgeCount = 0;

// Initialize badge counter from IndexedDB
const initBadgeCount = async () => {
	try {
		const openRequest = indexedDB.open('FreeDiNotifications', 1);

		openRequest.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains('badgeCounter')) {
				db.createObjectStore('badgeCounter', { keyPath: 'id' });
			}
		};

		openRequest.onsuccess = (event) => {
			const db = event.target.result;
			const transaction = db.transaction('badgeCounter', 'readonly');
			const store = transaction.objectStore('badgeCounter');
			const countRequest = store.get('badge');

			countRequest.onsuccess = () => {
				if (countRequest.result) {
					badgeCount = countRequest.result.count || 0;

					// Apply current badge count on initialization
					if ('setAppBadge' in navigator) {
						navigator.setAppBadge(badgeCount).catch(err =>
							console.error('Error setting badge on init:', err)
						);
					} else if ('setExperimentalAppBadge' in navigator) {
						// @ts-ignore - Experimental API
						navigator.setExperimentalAppBadge(badgeCount).catch(err =>
							console.error('Error setting experimental badge:', err)
						);
					} else if ('ExperimentalBadge' in window) {
						// @ts-ignore - Another experimental API seen in some browsers
						window.ExperimentalBadge.set(badgeCount).catch(err =>
							console.error('Error setting ExperimentalBadge:', err)
						);
					}
				}
			};
		};

		openRequest.onerror = (event) => {
			console.error('IndexedDB error when initializing badge:', event.target.error);
		};
	} catch (error) {
		console.error('Error initializing badge count:', error);
	}
};

// Update badge count in IndexedDB
const saveBadgeCount = async (count) => {
	try {
		const openRequest = indexedDB.open('FreeDiNotifications', 1);

		openRequest.onsuccess = (event) => {
			const db = event.target.result;
			const transaction = db.transaction('badgeCounter', 'readwrite');
			const store = transaction.objectStore('badgeCounter');

			store.put({ id: 'badge', count: count });
		};
	} catch (error) {
		console.error('Error saving badge count:', error);
	}
};

// Initialize the badge counter
initBadgeCount();

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

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage(async function (payload) {
	try {
		console.info('[firebase-messaging-sw.js] Received background message:', payload);

		// If there's no notification object, we can't show a notification
		if (!payload.notification) {
			console.error('No notification data in payload');
			return;
		}

		const { title, body, image } = payload.notification;
		const data = payload.data || {};

		// Generate a unique ID for this notification if not provided
		const notificationId = data.id || new Date().getTime().toString();

		// Store notification data in cache for access when user clicks
		notificationCache.set(notificationId, {
			...payload,
			timestamp: new Date().getTime()
		});

		// Default URL to open when notification is clicked
		const url = data.url || '/';

		// Enhanced notification options
		const notificationOptions = {
			body: body || '',
			icon: '/icons/logo-192px.png', // Local app icon
			badge: '/icons/logo-48px.png', // Badge icon
			image: image || '', // Large image if provided
			vibrate: [100, 50, 100, 50, 100], // Vibration pattern
			sound: '/assets/sounds/bell.mp3', // Sound file
			tag: data.tag || notificationId, // Group similar notifications
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

		// Handle badge counter for notification
		try {
			// Get all clients to check if any are visible
			const clients = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});

			// Only increment badge if all windows are hidden or not focused
			const allHidden = clients.every(client =>
				!client.visibilityState ||
				client.visibilityState === 'hidden' ||
				!client.focused
			);

			if (allHidden) {
				// Increment badge count
				badgeCount++;

				// Save the updated count to IndexedDB
				await saveBadgeCount(badgeCount);

				// Set badge using standard or experimental APIs based on browser support
				if ('setAppBadge' in navigator) {
					// Standard Badging API (Chrome, Edge, Safari)
					await navigator.setAppBadge(badgeCount)
						.catch(err => console.error('Error setting badge:', err));
				} else if ('setExperimentalAppBadge' in navigator) {
					// Experimental API for some browsers
					// @ts-ignore - Experimental API
					await navigator.setExperimentalAppBadge(badgeCount)
						.catch(err => console.error('Error setting experimental badge:', err));
				} else if ('ExperimentalBadge' in window) {
					// Another experimental API seen in some browsers
					// @ts-ignore - Experimental API
					await window.ExperimentalBadge.set(badgeCount)
						.catch(err => console.error('Error setting ExperimentalBadge:', err));
				}
			} else {
				// If app is visible, notify it about the new message anyway
				clients.forEach(client => {
					client.postMessage({
						type: 'NEW_NOTIFICATION_RECEIVED',
						payload: {
							...payload,
							notificationId
						}
					});
				});
			}
		} catch (error) {
			console.error('Error handling badge counter:', error);
		}

		// Show the notification
		await self.registration.showNotification(title || 'FreeDi App', notificationOptions);

		// Try to play sound (though this typically won't work in service worker)
		await playNotificationSound();

		console.info('Notification displayed successfully');
	} catch (error) {
		console.error('Error showing notification:', error);
	}
});

// Handle notification click
self.addEventListener('notificationclick', function (event) {
	console.info('Notification clicked:', event);

	// Close the notification
	event.notification.close();

	// Get notification data
	const data = event.notification.data || {};
	const url = data.url || '/';
	const notificationId = data.notificationId;

	// Clear badge when notification is clicked
	try {
		// Reset badge count
		badgeCount = 0;
		saveBadgeCount(0);

		// Clear badge using standard or experimental APIs based on browser support
		if ('clearAppBadge' in navigator) {
			// Standard Badging API (Chrome, Edge, Safari)
			navigator.clearAppBadge().catch(err => console.error('Error clearing badge:', err));
		} else if ('clearExperimentalAppBadge' in navigator) {
			// Experimental API for some browsers
			// @ts-ignore - Experimental API
			navigator.clearExperimentalAppBadge().catch(err => console.error('Error clearing experimental badge:', err));
		} else if ('ExperimentalBadge' in window) {
			// Another experimental API seen in some browsers
			// @ts-ignore - Experimental API
			window.ExperimentalBadge.clear().catch(err => console.error('Error clearing ExperimentalBadge:', err));
		}
	} catch (error) {
		console.error('Error clearing badge:', error);
	}

	// Handle action buttons - simplified to just 'open' since we removed 'dismiss'
	let actionUrl = url;
	if (event.action === 'open' && data.openUrl) {
		actionUrl = data.openUrl;
	}

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
					if (client.url.includes(actionUrl)) {
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

// Listen for messages from the main app
self.addEventListener('message', (event) => {
	console.info('Message received in SW:', event.data);

	if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
		// Clear all displayed notifications
		self.registration.getNotifications().then(notifications => {
			notifications.forEach(notification => notification.close());
		});

		// Clear app badge
		try {
			// Reset badge count
			badgeCount = 0;
			saveBadgeCount(0);

			// Clear badge using standard or experimental APIs based on browser support
			if ('clearAppBadge' in navigator) {
				// Standard Badging API (Chrome, Edge, Safari)
				navigator.clearAppBadge().catch(err => console.error('Error clearing badge:', err));
			} else if ('clearExperimentalAppBadge' in navigator) {
				// Experimental API for some browsers
				// @ts-ignore - Experimental API
				navigator.clearExperimentalAppBadge().catch(err => console.error('Error clearing experimental badge:', err));
			} else if ('ExperimentalBadge' in window) {
				// Another experimental API seen in some browsers
				// @ts-ignore - Experimental API
				window.ExperimentalBadge.clear().catch(err => console.error('Error clearing ExperimentalBadge:', err));
			}
		} catch (error) {
			console.error('Error clearing badge:', error);
		}
	}
});