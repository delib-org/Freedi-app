import { getMessaging, onMessage } from 'firebase/messaging';
import { app } from '@/controllers/db/config';

let messageCount = 0;

export function monitorNotifications() {
    // console.info('=== STARTING NOTIFICATION MONITOR ===');
    
    try {
        const messaging = getMessaging(app);
        
        // Monitor foreground messages
        onMessage(messaging, () => {
            messageCount++;
           
        });
        
    } catch (error) {
        console.error('Error setting up monitor:', error);
    }
}

// Also monitor service worker messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        // Uncomment for debugging service worker messages
        // console.info('[SW MESSAGE]', { data: event.data });
    });
}

// Add to window
if (typeof window !== 'undefined') {
    (window as { monitorNotifications?: typeof monitorNotifications }).monitorNotifications = monitorNotifications;
    
    // Auto-start monitoring
    // Run monitorNotifications() to start monitoring
}