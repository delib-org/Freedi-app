/**
 * Service for Firebase Cloud Messaging (FCM) operations.
 *
 * Responsibilities:
 * - Initialize Firebase Messaging
 * - Request and manage FCM tokens
 * - Set up foreground message listeners
 * - Handle service worker coordination
 * - Play notification sounds
 *
 * This service follows Single Responsibility Principle (SRP) by focusing
 * only on FCM operations, extracted from NotificationService.
 */

import type { Messaging, MessagePayload } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';
import { isFirebaseMessagingSupported, isBrowserNotificationsSupported } from './platformService';

// Token refresh interval (30 days in milliseconds)
const TOKEN_REFRESH_INTERVAL = 30 * 24 * 60 * 60 * 1000;

/**
 * State for the PushService.
 */
interface PushServiceState {
	messaging: Messaging | null;
	token: string | null;
	notificationHandler: ((payload: MessagePayload) => void) | null;
	isInitialized: boolean;
}

const state: PushServiceState = {
	messaging: null,
	token: null,
	notificationHandler: null,
	isInitialized: false,
};

/**
 * Check if browser supports basic notifications.
 */
export const isSupported = (): boolean => isBrowserNotificationsSupported();

/**
 * Safely get the current notification permission.
 */
export const safeGetPermission = (): NotificationPermission | 'unsupported' => {
	if (!isSupported()) {
		return 'unsupported';
	}

	try {
		return Notification.permission;
	} catch (error) {
		console.error('Error accessing Notification.permission:', error);

		return 'unsupported';
	}
};

/**
 * Check if the user has granted notification permission.
 */
export const hasPermission = (): boolean => {
	return isSupported() && Notification.permission === 'granted';
};

/**
 * Request permission to show notifications.
 */
export const requestPermission = async (): Promise<boolean> => {
	if (!isSupported()) {
		return false;
	}

	try {
		const permission = await Notification.requestPermission();

		return permission === 'granted';
	} catch (error) {
		console.error('Failed to request notification permission:', error);

		return false;
	}
};

/**
 * Wait for the Firebase messaging service worker to be ready.
 */
export const waitForServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
	if (!('serviceWorker' in navigator)) {
		console.error('Service workers not supported');

		return null;
	}

	try {
		// First, list all registrations
		const allRegistrations = await navigator.serviceWorker.getRegistrations();

		// Check if firebase-messaging-sw.js is already registered at root scope
		let registration = await navigator.serviceWorker.getRegistration('/');

		// If the root registration isn't the Firebase one, look for it explicitly
		if (!registration || !registration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
			// Try to find it in all registrations
			registration = allRegistrations.find((r) =>
				r.active?.scriptURL.includes('firebase-messaging-sw.js')
			);
		}

		if (!registration) {
			// Wait for the service worker to be registered
			await new Promise<void>((resolve) => {
				const checkInterval = setInterval(async () => {
					const regs = await navigator.serviceWorker.getRegistrations();
					registration = regs.find((r) =>
						r.active?.scriptURL.includes('firebase-messaging-sw.js')
					);
					if (registration && registration.active) {
						clearInterval(checkInterval);
						resolve();
					}
				}, 500);

				// Timeout after 10 seconds
				setTimeout(() => {
					clearInterval(checkInterval);
					console.error('[PushService] Timeout waiting for service worker');
					resolve(); // Resolve anyway to continue
				}, 10000);
			});
		} else if (!registration.active) {
			await navigator.serviceWorker.ready;
		}

		return registration || null;
	} catch (error) {
		console.error('[PushService] Error waiting for service worker:', error);

		return null;
	}
};

/**
 * Initialize Firebase Messaging.
 */
export const initializeMessaging = async (): Promise<boolean> => {
	if (!isFirebaseMessagingSupported()) {
		console.info('[PushService] Firebase Messaging not supported on this platform');

		return false;
	}

	try {
		if (!state.messaging) {
			const { getMessaging } = await import('firebase/messaging');
			state.messaging = getMessaging(app);
		}

		return true;
	} catch (error) {
		console.error('[PushService] Failed to initialize Firebase Messaging:', error);

		return false;
	}
};

/**
 * Get or refresh the FCM token.
 */
export const getOrRefreshToken = async (forceRefresh: boolean = false): Promise<string | null> => {
	if (!isSupported()) {
		return null;
	}

	try {
		// Initialize messaging if not already done
		if (!(await initializeMessaging())) {
			console.error('[PushService] Failed to initialize messaging in getOrRefreshToken');

			return null;
		}

		// Request permission first if not granted
		if (Notification.permission !== 'granted') {
			const permissionGranted = await requestPermission();
			if (!permissionGranted) {
				return null;
			}
		}

		// Delete old token if force refresh
		if (forceRefresh && state.token && state.messaging) {
			try {
				const { deleteToken } = await import('firebase/messaging');
				await deleteToken(state.messaging);
			} catch (error) {
				console.error('[PushService] Error deleting old token:', error);
			}
		}

		// Get Firebase messaging service worker registration
		const swRegistration = await waitForServiceWorker();

		if (!swRegistration) {
			console.error('[PushService] No Firebase messaging service worker registration found!');

			return null;
		}

		// Check for invalid/placeholder VAPID keys
		const invalidKeys = ['your-vapid-key', 'undefined', 'null', ''];
		if (!vapidKey || invalidKeys.includes(vapidKey) || vapidKey.length < 65) {
			console.info('[PushService] FCM notifications disabled - VAPID key not configured');

			return null;
		}

		const { getToken } = await import('firebase/messaging');
		const currentToken = await getToken(state.messaging!, {
			vapidKey,
			serviceWorkerRegistration: swRegistration,
		});

		if (currentToken) {
			state.token = currentToken;

			return currentToken;
		} else {
			console.error('[PushService] No token received from getToken()');
			state.token = null;

			return null;
		}
	} catch (error) {
		console.error('[PushService] Error getting FCM token:', error);

		return null;
	}
};

/**
 * Delete the current FCM token.
 */
export const deleteCurrentToken = async (): Promise<void> => {
	if (state.messaging && state.token) {
		try {
			const { deleteToken } = await import('firebase/messaging');
			await deleteToken(state.messaging);
			state.token = null;
		} catch (error) {
			console.error('[PushService] Error deleting FCM token:', error);
		}
	}
};

/**
 * Set up a listener for foreground messages.
 */
export const setupForegroundListener = async (
	onMessage?: (payload: MessagePayload) => void
): Promise<void> => {
	if (!isSupported() || !state.messaging) {
		return;
	}

	try {
		const { onMessage: firebaseOnMessage } = await import('firebase/messaging');
		firebaseOnMessage(state.messaging, (payload) => {
			// If we have a notification payload, show it
			if (payload.notification) {
				showForegroundNotification(payload);
			}

			// Call the registered handler if one exists
			if (onMessage) {
				onMessage(payload);
			}

			if (state.notificationHandler) {
				state.notificationHandler(payload);
			}
		});
	} catch (error) {
		console.error('[PushService] Error setting up foreground listener:', error);
	}
};

/**
 * Display a notification when the app is in the foreground.
 */
const showForegroundNotification = (payload: MessagePayload): void => {
	if (!isSupported()) {
		return;
	}

	const notificationTitle = payload.notification?.title || 'FreeDi App';
	const notificationOptions = {
		body: payload.notification?.body || '',
		icon: '/icons/logo-192px.png',
		badge: '/icons/logo-48px.png',
		vibrate: [100, 50, 100],
		tag: payload.data?.tag || 'default',
		data: payload.data,
		requireInteraction: true,
		actions: [
			{
				action: 'open',
				title: 'Open',
			},
		],
	};

	// Play notification sound
	playNotificationSound();

	// Show notification if permission is granted
	if (Notification.permission === 'granted') {
		navigator.serviceWorker.ready.then((registration) => {
			registration.showNotification(notificationTitle, notificationOptions);
		});
	}
};

/**
 * Play a notification sound.
 */
export const playNotificationSound = (): void => {
	try {
		const audio = new Audio('/assets/sounds/bell.mp3');
		audio.play().catch((error) => console.error('Error playing notification sound:', error));
	} catch (error) {
		console.error('Error playing notification sound:', error);
	}
};

/**
 * Register a handler for receiving notifications.
 */
export const setNotificationHandler = (handler: (payload: MessagePayload) => void): void => {
	state.notificationHandler = handler;
};

/**
 * Get the current FCM token.
 */
export const getToken = (): string | null => state.token;

/**
 * Check if the service is initialized.
 */
export const isInitialized = (): boolean => !!state.messaging && !!state.token;

/**
 * Get the token refresh interval in milliseconds.
 */
export const getTokenRefreshInterval = (): number => TOKEN_REFRESH_INTERVAL;

/**
 * PushService singleton for convenience.
 */
export const PushService = {
	isSupported,
	safeGetPermission,
	hasPermission,
	requestPermission,
	waitForServiceWorker,
	initializeMessaging,
	getOrRefreshToken,
	deleteCurrentToken,
	setupForegroundListener,
	playNotificationSound,
	setNotificationHandler,
	getToken,
	isInitialized,
	getTokenRefreshInterval,
} as const;
