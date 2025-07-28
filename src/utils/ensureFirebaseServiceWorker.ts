import { getMessaging, getToken } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';

let isRegistering = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Ensures Firebase Messaging Service Worker is registered
 * This is a safety fallback in case PWAWrapper fails to register it
 */
export async function ensureFirebaseServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.info('[FirebaseSW] Service workers not supported');
        return;
    }

    if (isRegistering) {
        console.info('[FirebaseSW] Already registering, skipping duplicate call');
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
            console.info('[FirebaseSW] Already registered and active');
            return firebaseSW;
        }

        console.info('[FirebaseSW] Not found, registering...');
        
        // Register Firebase messaging service worker with explicit scope
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/',
            updateViaCache: 'none' // Ensure fresh SW updates
        });

        console.info('[FirebaseSW] Registration successful:', registration.scope);

        // Wait for the service worker to be ready
        if (registration.installing || registration.waiting) {
            console.info('[FirebaseSW] Waiting for activation...');
            await new Promise((resolve) => {
                const sw = registration.installing || registration.waiting;
                sw!.addEventListener('statechange', function() {
                    if (this.state === 'activated') {
                        console.info('[FirebaseSW] Activated');
                        resolve(true);
                    }
                });
                // Timeout after 10 seconds
                setTimeout(() => resolve(false), 10000);
            });
        } else if (registration.active) {
            console.info('[FirebaseSW] Already active');
        }

        // Initialize FCM with the registered service worker
        try {
            const messaging = getMessaging(app);
            const token = await getToken(messaging, {
                vapidKey,
                serviceWorkerRegistration: registration
            });
            
            if (token) {
                console.info('[FirebaseSW] FCM token obtained successfully');
            } else {
                console.warn('[FirebaseSW] Failed to get FCM token');
            }
        } catch (error) {
            console.error('[FirebaseSW] Error getting token:', error);
        }

        return registration;
    } catch (error) {
        console.error('[FirebaseSW] Registration failed:', error);
        throw error;
    } finally {
        isRegistering = false;
    }
}

// Start periodic check to ensure Firebase SW stays registered
export function startFirebaseServiceWorkerMonitor() {
    if (checkInterval) return; // Already monitoring
    
    checkInterval = setInterval(async () => {
        if (!navigator.serviceWorker) return;
        
        const registrations = await navigator.serviceWorker.getRegistrations();
        const hasFirebaseSW = registrations.some(r => 
            (r.active?.scriptURL || '').includes('firebase-messaging-sw.js')
        );
        
        if (!hasFirebaseSW) {
            console.warn('[FirebaseSW] Missing from registrations, re-registering...');
            ensureFirebaseServiceWorker();
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

// Auto-start on load
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    // Ensure registration on various events
    const registerFirebaseSW = () => {
        ensureFirebaseServiceWorker();
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
            ensureFirebaseServiceWorker();
        }
    });
}