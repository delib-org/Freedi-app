import type { Messaging } from 'firebase/messaging';
import { app } from '@/controllers/db/config';
import { vapidKey } from '@/controllers/db/configKey';

/**
 * Ensures the main Service Worker is ready and initializes Firebase Messaging
 */
export async function ensureFirebaseServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return undefined;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        // Initialize FCM with the registered service worker
        try {
            // Dynamically import to avoid load-time errors on unsupported browsers
             const { getMessaging, getToken } = await import('firebase/messaging');
             
             // Check if Messaging is supported
             const isSupported = await import('firebase/messaging').then(m => m.isSupported());
             if (!isSupported) {
                 console.info('[FirebaseSW] Messaging not supported (or iOS < 16.4)');

                 return registration;
             }

            const messaging: Messaging = getMessaging(app);
            
            // Note: We use the existing registration which IS the PWA service worker
            const token = await getToken(messaging, {
                vapidKey,
                serviceWorkerRegistration: registration
            });

            if (token) {
                 console.info('[FirebaseSW] Token retrieved successfully');
            }
        } catch (error) {
            console.error('[FirebaseSW] Error initializing messaging:', error);
        }

        return registration;
    } catch (error) {
        console.error('[FirebaseSW] Failed to get SW registration:', error);
        return undefined;
    }
}

// Monitor is less critical now as the PWA framework handles the SW life cycle, 
// but we keep a simplified version just to log status.
export function startFirebaseServiceWorkerMonitor() {
    // No-op for now to avoid conflicts
}

export function stopFirebaseServiceWorkerMonitor() {
    // No-op
}