/**
 * Ensures Firebase Messaging Service Worker is registered
 * This is a safety fallback in case PWAWrapper fails to register it
 */
export async function ensureFirebaseServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.info('[FirebaseSW] Service workers not supported');
        return;
    }

    try {
        // Check if Firebase SW is already registered
        const registrations = await navigator.serviceWorker.getRegistrations();
        const firebaseSW = registrations.find(r => 
            r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
            r.scope.includes('firebase-cloud-messaging-push-scope')
        );
        
        if (firebaseSW && firebaseSW.active) {
            console.info('[FirebaseSW] Already registered and active');
            return;
        }
        
        // Register Firebase messaging SW
        console.info('[FirebaseSW] Registering Firebase messaging service worker...');
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        
        // Wait for activation
        if (!registration.active) {
            await new Promise<void>((resolve) => {
                const stateChangeHandler = () => {
                    if (registration.active) {
                        registration.installing?.removeEventListener('statechange', stateChangeHandler);
                        registration.waiting?.removeEventListener('statechange', stateChangeHandler);
                        resolve();
                    }
                };
                
                if (registration.installing) {
                    registration.installing.addEventListener('statechange', stateChangeHandler);
                } else if (registration.waiting) {
                    registration.waiting.addEventListener('statechange', stateChangeHandler);
                }
                
                // Timeout after 10 seconds
                setTimeout(resolve, 10000);
            });
        }
        
        console.info('[FirebaseSW] Registration successful, scope:', registration.scope);
    } catch (error) {
        console.error('[FirebaseSW] Registration failed:', error);
    }
}

// Register on load
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    // Wait for window load to not block critical resources
    if (document.readyState === 'complete') {
        ensureFirebaseServiceWorker();
    } else {
        window.addEventListener('load', ensureFirebaseServiceWorker);
    }
}