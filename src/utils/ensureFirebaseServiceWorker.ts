import type { Messaging } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';

let isRegistering = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;

// Helper function to check if we're on iOS
const isIOS = (): boolean => {
	const userAgent = navigator.userAgent.toLowerCase();

	return /iphone|ipad|ipod/.test(userAgent) ||
		   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

    if (isRegistering) {
        // Already registering, skip duplicate call
        return;
    }

    try {
        isRegistering = true;

        // Check if Firebase SW is already registered
        const registrations = await navigator.serviceWorker.getRegistrations();
        const firebaseSW = registrations.find(r =>
            r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
            r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
            r.waiting?.scriptURL.includes('firebase-messaging-sw.js')
        );

        if (firebaseSW && firebaseSW.active) {
            // Firebase SW already registered and active
            return firebaseSW;
        }

        // Firebase SW not found, registering

        // Register Firebase messaging service worker at ROOT scope to receive push notifications
        // Firebase messaging requires the SW to be at root scope to intercept push events
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/',
            updateViaCache: 'none' // Ensure fresh SW updates
        });

        // Firebase SW registration successful

        // Wait for the service worker to be ready
        if (registration.installing || registration.waiting) {
            // Wait for Firebase SW activation
            await new Promise((resolve) => {
                const sw = registration.installing || registration.waiting;
                sw!.addEventListener('statechange', function() {
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

        // Initialize FCM with the registered service worker
        try {
            // Dynamically import Firebase messaging functions to avoid loading on iOS
            const { getMessaging, getToken } = await import('firebase/messaging');
            const messaging: Messaging = getMessaging(app);
            const token = await getToken(messaging, {
                vapidKey,
                serviceWorkerRegistration: registration
            });

            if (token) {
                // FCM token obtained successfully
            } else {
                // Failed to get FCM token
            }
        } catch (error) {
            console.error('[FirebaseSW] Error getting token:', error);
        }

        return registration;
    } catch (error) {
        console.error('[FirebaseSW] Registration failed:', error);
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
            const hasFirebaseSW = registrations.some(r =>
                (r.active?.scriptURL || '').includes('firebase-messaging-sw.js')
            );

            if (!hasFirebaseSW) {
                // Firebase SW missing, re-registering
                ensureFirebaseServiceWorker().catch(error => {
                    console.error('[FirebaseSW] Monitor re-registration failed:', error);
                });
            }
        } catch (error) {
            console.error('[FirebaseSW] Monitor check failed:', error);
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

// Auto-start on load (but not on iOS)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isIOS()) {
    // Ensure registration on various events
    const registerFirebaseSW = () => {
        ensureFirebaseServiceWorker().catch(error => {
            console.error('[FirebaseSW] Initial registration failed:', error);
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
            ensureFirebaseServiceWorker().catch(error => {
                console.error('[FirebaseSW] Visibility change registration failed:', error);
            });
        }
    });
}
