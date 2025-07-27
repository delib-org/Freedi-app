import { notificationService } from '@/services/notificationService';
import { vapidKey } from '@/controllers/db/configKey';
import { auth } from '@/controllers/db/config';

interface DebugResults {
    environment?: {
        mode: string;
        isDev: boolean;
        isProd: boolean;
        baseUrl: string;
        currentDomain: string;
        protocol: string;
    };
    firebase?: {
        projectId: string;
        messagingSenderId: string;
        appId: string;
        vapidKeyExists: boolean;
        vapidKeyLength: number;
        vapidKeyValue: string;
        vapidKeyPreview: string;
    };
    browserSupport?: {
        serviceWorker: boolean;
        notifications: boolean;
        pushManager: boolean;
        permission: NotificationPermission | string;
    };
    serviceWorkers?: {
        totalRegistrations: number;
        registrations: Array<{
            scope: string;
            active: boolean;
            scriptURL: string;
            state: string;
            isFirebaseMessaging: boolean;
        }>;
    };
    auth?: {
        isAuthenticated: boolean;
        userId: string;
        email: string;
    };
    notificationService?: unknown;
    fcmToken?: {
        success: boolean;
        tokenPreview: string;
        tokenLength: number;
    };
    notificationServiceError?: {
        error: string;
        stack?: string;
    };
}

export async function comprehensiveNotificationDebug() {
    console.info('%c=== COMPREHENSIVE NOTIFICATION DEBUG ===', 'color: blue; font-weight: bold; font-size: 16px');
    
    const results: DebugResults = {};
    
    // 1. Environment Check
    console.info('%c1. Environment Check', 'color: green; font-weight: bold');
    results.environment = {
        mode: import.meta.env.MODE,
        isDev: import.meta.env.DEV,
        isProd: import.meta.env.PROD,
        baseUrl: import.meta.env.BASE_URL,
        currentDomain: window.location.hostname,
        protocol: window.location.protocol
    };
    console.info('Environment:', JSON.stringify(results.environment, null, 2));
    
    // 2. Firebase Configuration
    console.info('%c2. Firebase Configuration', 'color: green; font-weight: bold');
    results.firebase = {
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'NOT_SET',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'NOT_SET',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || 'NOT_SET',
        vapidKeyExists: !!vapidKey,
        vapidKeyLength: vapidKey ? vapidKey.length : 0,
        vapidKeyValue: vapidKey === 'undefined' ? 'STRING_UNDEFINED' : (vapidKey || 'NOT_SET'),
        vapidKeyPreview: vapidKey && vapidKey !== 'undefined' ? vapidKey.substring(0, 20) + '...' : 'INVALID'
    };
    console.info('Firebase Config:', JSON.stringify(results.firebase, null, 2));
    
    // 3. Browser Capabilities
    console.info('%c3. Browser Capabilities', 'color: green; font-weight: bold');
    results.browserSupport = {
        serviceWorker: 'serviceWorker' in navigator,
        notifications: 'Notification' in window,
        pushManager: 'PushManager' in window,
        permission: 'Notification' in window ? Notification.permission : 'not-supported'
    };
    console.info('Browser Support:', JSON.stringify(results.browserSupport, null, 2));
    
    // 4. Service Workers
    console.info('%c4. Service Workers', 'color: green; font-weight: bold');
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        results.serviceWorkers = {
            totalRegistrations: registrations.length,
            registrations: registrations.map(reg => ({
                scope: reg.scope,
                active: !!reg.active,
                scriptURL: reg.active?.scriptURL || 'none',
                state: reg.active?.state || 'none',
                isFirebaseMessaging: reg.active?.scriptURL.includes('firebase-messaging-sw.js') || false
            }))
        };
        console.info('Service Workers:', JSON.stringify(results.serviceWorkers?.registrations, null, 2));
        
        // Check specific Firebase SW
        const firebaseSW = registrations.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));
        if (firebaseSW) {
            console.info('✅ Firebase messaging SW found and active');
        } else {
            // Check if it's registered under a different scope
            const fbSwRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
            if (fbSwRegistration) {
                console.info('✅ Firebase messaging SW found under specific scope:', fbSwRegistration.scope);
                results.serviceWorkers.registrations.push({
                    scope: fbSwRegistration.scope,
                    active: !!fbSwRegistration.active,
                    scriptURL: fbSwRegistration.active?.scriptURL || 'none',
                    state: fbSwRegistration.active?.state || 'none',
                    isFirebaseMessaging: true
                });
            } else {
                console.error('❌ Firebase messaging SW not found or not active');
            }
        }
    }
    
    // 5. Authentication Status
    console.info('%c5. Authentication Status', 'color: green; font-weight: bold');
    const user = auth.currentUser;
    results.auth = {
        isAuthenticated: !!user,
        userId: user?.uid || 'NOT_LOGGED_IN',
        email: user?.email || 'NOT_LOGGED_IN'
    };
    console.info('Auth Status:', JSON.stringify(results.auth, null, 2));
    
    // 6. Notification Service Status
    console.info('%c6. Notification Service Status', 'color: green; font-weight: bold');
    try {
        const diagnostics = await notificationService.getDiagnostics();
        results.notificationService = diagnostics;
        console.info('Diagnostics:', JSON.stringify(diagnostics, null, 2));
        
        // Try to get token if user is authenticated
        if (user) {
            console.info('Attempting to get FCM token...');
            const token = await notificationService.getOrRefreshToken(user.uid);
            results.fcmToken = {
                success: !!token,
                tokenPreview: token ? token.substring(0, 30) + '...' : 'FAILED',
                tokenLength: token ? token.length : 0
            };
            console.info('FCM Token Result:', JSON.stringify(results.fcmToken, null, 2));
        }
    } catch (error) {
        console.error('Error getting notification diagnostics:', error);
        results.notificationServiceError = {
            error: (error as Error).message,
            stack: (error as Error).stack
        };
    }
    
    // 7. Common Issues Check
    console.info('%c7. Common Issues Check', 'color: orange; font-weight: bold');
    const issues = [];
    
    if (!vapidKey || vapidKey === 'undefined' || vapidKey.length < 10) {
        issues.push('❌ VAPID key is missing or invalid');
    }
    
    if (!results.browserSupport?.serviceWorker) {
        issues.push('❌ Service Workers not supported');
    }
    
    if (!results.browserSupport?.notifications) {
        issues.push('❌ Notifications API not supported');
    }
    
    if (results.browserSupport?.permission === 'denied') {
        issues.push('❌ Notification permission denied');
    }
    
    if (!user) {
        issues.push('❌ User not authenticated');
    }
    
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        issues.push('❌ Not running on HTTPS (required for notifications)');
    }
    
    const firebaseSW = results.serviceWorkers?.registrations?.find((r) => r.isFirebaseMessaging);
    if (!firebaseSW || !firebaseSW.active) {
        issues.push('❌ Firebase messaging service worker not active');
    }
    
    if (issues.length > 0) {
        console.error('%cIssues Found:', 'color: red; font-weight: bold');
        issues.forEach(issue => console.error(issue));
    } else {
        console.info('%c✅ No obvious issues found', 'color: green; font-weight: bold');
    }
    
    // 8. Recommendations
    console.info('%c8. Recommendations', 'color: purple; font-weight: bold');
    if (!vapidKey || vapidKey === 'undefined') {
        console.info('1. Add VAPID key to your environment file:');
        console.info('   - For development: Add to .env.development');
        console.info('   - For testing: Add to .env.testing');
        console.info('   - For production: Add to .env.production');
        console.info('   - Get VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates');
    }
    
    if (results.browserSupport?.permission === 'default') {
        console.info('2. Request notification permission by calling: notificationService.requestPermission()');
    }
    
    console.info('%c=== END DEBUG ===', 'color: blue; font-weight: bold; font-size: 16px');
    
    return results;
}

// Add to window for easy access
if (typeof window !== 'undefined') {
    (window as { comprehensiveNotificationDebug?: typeof comprehensiveNotificationDebug }).comprehensiveNotificationDebug = comprehensiveNotificationDebug;
}