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
// Current domain detected: ' + currentDomain

// Select Firebase config based on the domain
let firebaseConfig;
if (currentDomain === 'freedi.tech' || currentDomain === 'delib.web.app' || currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
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
	// Freedi Test config
	firebaseConfig = {
		apiKey: 'AIzaSyBCgq3y9WjS8ZkB-q_lnkFM2BuUdLp2M-g',
		authDomain: 'freedi-test.firebaseapp.com',
		projectId: 'freedi-test',
		storageBucket: 'freedi-test.firebasestorage.app',
		messagingSenderId: '47037334917',
		appId: '1:47037334917:web:f9bce2dd772b5efd29f0ec'
	};
} else if (currentDomain === 'wizcol-app.web.app' || currentDomain === 'app.wizcol.com') {
	// Wizcol Production config
	firebaseConfig = {
		apiKey: 'AIzaSyBtm5USTMMQqf9KQ3ZIne6VbZ6AGOiT-Ts',
		authDomain: 'wizcol-app.firebaseapp.com',
		projectId: 'wizcol-app',
		storageBucket: 'wizcol-app.firebasestorage.app',
		messagingSenderId: '337833396726',
		appId: '1:337833396726:web:b80268707145886ce95fd7'
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
		// Received background message

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

		// Notification displayed successfully
	} catch (error) {
		console.error('Error showing notification:', error);
	}
});

// Handle notification click
self.addEventListener('notificationclick', function (event) {
	// Notification clicked

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
					// Clear all displayed notifications
					const notifications = await self.registration.getNotifications();
					notifications.forEach(notification => notification.close());

					// Reset badge count
					badgeCount = 0;
					await saveBadgeCount(0);

					// Clear badge using standard or experimental APIs based on browser support
					if ('clearAppBadge' in navigator) {
						// Standard Badging API (Chrome, Edge, Safari)
						await navigator.clearAppBadge().catch(err => console.error('Error clearing badge:', err));
					} else if ('clearExperimentalAppBadge' in navigator) {
						// Experimental API for some browsers
						// @ts-ignore - Experimental API
						await navigator.clearExperimentalAppBadge().catch(err => console.error('Error clearing experimental badge:', err));
					} else if ('ExperimentalBadge' in window) {
						// Another experimental API seen in some browsers
						// @ts-ignore - Experimental API
						await window.ExperimentalBadge.clear().catch(err => console.error('Error clearing ExperimentalBadge:', err));
					}

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