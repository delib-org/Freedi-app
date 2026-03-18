import { logError } from '@/utils/errorHandling';
import { isBot } from '@/utils/botDetection';

let isRegistering = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;

// Helper function to check if we're on iOS
const isIOS = (): boolean => {
	const userAgent = navigator.userAgent.toLowerCase();

	return (
		/iphone|ipad|ipod/.test(userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
};

/**
 * Ensures Firebase Messaging Service Worker is registered
 * This is a safety fallback in case PWAWrapper fails to register it
 * NOTE: This will not run on iOS as Firebase Messaging is not supported
 */
export async function ensureFirebaseServiceWorker() {
	if (!('serviceWorker' in navigator)) {
		// Service workers not supported
		return;
	}

	// Don't run on iOS - Firebase Messaging is not supported
	if (isIOS()) {
		console.info('[FirebaseSW] Skipping on iOS - Firebase Messaging not supported');

		return;
	}

	// Don't run for bots/crawlers - they can't register service workers
	if (isBot()) {
		return;
	}

	if (isRegistering) {
		// Already registering, skip duplicate call
		return;
	}

	try {
		isRegistering = true;

		// Check if Firebase SW is already registered
		const registrations = await navigator.serviceWorker.getRegistrations();
		const firebaseSW = registrations.find(
			(r) =>
				r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
				r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
				r.waiting?.scriptURL.includes('firebase-messaging-sw.js'),
		);

		if (firebaseSW && firebaseSW.active) {
			// Firebase SW already registered and active
			return firebaseSW;
		}

		// Firebase SW not found, registering

		// Register Firebase messaging service worker with Firebase's default scope
		// This allows it to coexist with the PWA's main sw.js at root scope
		const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
			scope: '/firebase-cloud-messaging-push-scope',
			updateViaCache: 'none', // Ensure fresh SW updates
		});

		// Firebase SW registration successful

		// Wait for the service worker to be ready
		if (registration.installing || registration.waiting) {
			// Wait for Firebase SW activation
			await new Promise((resolve) => {
				const sw = registration.installing || registration.waiting;
				sw!.addEventListener('statechange', function () {
					if (this.state === 'activated') {
						// Firebase SW activated
						resolve(true);
					}
				});
				// Timeout after 10 seconds
				setTimeout(() => resolve(false), 10000);
			});
		} else if (registration.active) {
			// Firebase SW already active
		}

		// NOTE: Do NOT acquire FCM token here.
		// Token acquisition is deferred until the user has shown intent
		// (e.g., 3 actions in a discussion, or explicit notification prompt interaction).
		// The service worker registration alone is sufficient for receiving push
		// messages once a token is obtained later through NotificationService.

		return registration;
	} catch (error) {
		// permission-blocked is expected when users deny notifications — don't report to Sentry
		const isPermissionBlocked =
			error instanceof Error && error.message.includes('permission-blocked');
		if (!isPermissionBlocked) {
			logError(error, {
				operation: 'utils.ensureFirebaseServiceWorker.unknown',
				metadata: { message: '[FirebaseSW] Registration failed:' },
			});
		}
		// Don't throw - fail gracefully to avoid unhandled rejections

		return undefined;
	} finally {
		isRegistering = false;
	}
}

// Start periodic check to ensure Firebase SW stays registered
export function startFirebaseServiceWorkerMonitor() {
	if (checkInterval) return; // Already monitoring

	checkInterval = setInterval(async () => {
		try {
			if (!navigator.serviceWorker) return;

			const registrations = await navigator.serviceWorker.getRegistrations();
			const hasFirebaseSW = registrations.some((r) =>
				(r.active?.scriptURL || '').includes('firebase-messaging-sw.js'),
			);

			if (!hasFirebaseSW) {
				// Firebase SW missing, re-registering
				ensureFirebaseServiceWorker().catch((error) => {
					logError(error, {
						operation: 'utils.ensureFirebaseServiceWorker.hasFirebaseSW',
						metadata: { message: '[FirebaseSW] Monitor re-registration failed:' },
					});
				});
			}
		} catch (error) {
			logError(error, {
				operation: 'utils.ensureFirebaseServiceWorker.hasFirebaseSW',
				metadata: { message: '[FirebaseSW] Monitor check failed:' },
			});
		}
	}, 30000); // Check every 30 seconds
}

// Stop monitoring
export function stopFirebaseServiceWorkerMonitor() {
	if (checkInterval) {
		clearInterval(checkInterval);
		checkInterval = null;
	}
}

// Auto-start on load (but not on iOS or bots)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isIOS() && !isBot()) {
	// Ensure registration on various events
	const registerFirebaseSW = () => {
		ensureFirebaseServiceWorker().catch((error) => {
			logError(error, {
				operation: 'utils.ensureFirebaseServiceWorker.registerFirebaseSW',
				metadata: { message: '[FirebaseSW] Initial registration failed:' },
			});
		});
		startFirebaseServiceWorkerMonitor();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', registerFirebaseSW);
	} else {
		// DOM already loaded
		registerFirebaseSW();
	}

	// Also register on page visibility change (in case SW was terminated)
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			ensureFirebaseServiceWorker().catch((error) => {
				logError(error, {
					operation: 'utils.ensureFirebaseServiceWorker.registerFirebaseSW',
					metadata: { message: '[FirebaseSW] Visibility change registration failed:' },
				});
			});
		}
	});
}
