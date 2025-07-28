import { getMessaging, onMessage } from 'firebase/messaging';
import { app } from '@/controllers/db/config';

let messageCount = 0;

export function monitorNotifications() {
    console.info('%c=== STARTING NOTIFICATION MONITOR ===', 'color: green; font-weight: bold; font-size: 16px');
    
    try {
        const messaging = getMessaging(app);
        
        // Monitor foreground messages
        onMessage(messaging, (payload) => {
            messageCount++;
            console.info(`%c[NOTIFICATION ${messageCount}] Message received!`, 'color: green; font-weight: bold');
            console.info('Payload:', payload);
            console.info('From:', payload.from);
            console.info('Notification:', payload.notification);
            console.info('Data:', payload.data);
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
        console.info('%c[SW MESSAGE]', 'color: blue; font-weight: bold', event.data);
    });
}

// Add to window
if (typeof window !== 'undefined') {
    (window as { monitorNotifications?: typeof monitorNotifications }).monitorNotifications = monitorNotifications;
    
    // Auto-start monitoring
    console.info('To start monitoring notifications, run: monitorNotifications()');
}