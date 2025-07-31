import { getMessaging, onMessage } from 'firebase/messaging';
import { app } from '@/controllers/db/config';

let messageCount = 0;

export function monitorNotifications() {
    console.info('=== STARTING NOTIFICATION MONITOR ===');
    
    try {
        const messaging = getMessaging(app);
        
        // Monitor foreground messages
        onMessage(messaging, (payload) => {
            messageCount++;
            console.info(`[NOTIFICATION ${messageCount}] Message received!`);
            console.info('Payload:', { payload });
            console.info('From:', { from: payload.from });
            console.info('Notification:', { notification: payload.notification });
            console.info('Data:', { data: payload.data });
            console.info('---');
            
            // Check if notification should be shown
            if (payload.notification) {
                console.info('Notification content:', {
                    title: payload.notification.title,
                    body: payload.notification.body
                });
            }
        });
        
        console.info('✅ Notification monitor active. Waiting for messages...');
        console.info('Test by having another browser post a message.');
        
    } catch (error) {
        console.error('Error setting up monitor:', error);
    }
}

// Also monitor service worker messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        console.info('[SW MESSAGE]', { data: event.data });
    });
}

// Add to window
if (typeof window !== 'undefined') {
    (window as { monitorNotifications?: typeof monitorNotifications }).monitorNotifications = monitorNotifications;
    
    // Auto-start monitoring
    // Run monitorNotifications() to start monitoring
}