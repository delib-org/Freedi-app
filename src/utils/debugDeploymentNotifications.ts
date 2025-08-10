import firebaseConfig from '@/controllers/db/configKey';
import { vapidKey } from '@/controllers/db/configKey';

export async function debugDeploymentNotifications() {
    console.info('%c=== DEPLOYMENT NOTIFICATIONS DEBUG ===', 'color: red; font-weight: bold; font-size: 16px');
    
    // 1. Current environment
    console.info('%c1. Current Environment:', 'color: blue; font-weight: bold');
    console.info('   - Domain:', window.location.hostname);
    console.info('   - Protocol:', window.location.protocol);
    console.info('   - Mode:', import.meta.env.MODE);
    console.info('   - Is Production:', import.meta.env.PROD);
    
    // 2. Main app Firebase config
    console.info('%c2. Main App Firebase Config:', 'color: blue; font-weight: bold');
    console.info('   - Project ID:', firebaseConfig.projectId || 'NOT SET');
    console.info('   - Messaging Sender ID:', firebaseConfig.messagingSenderId || 'NOT SET');
    console.info('   - Auth Domain:', firebaseConfig.authDomain || 'NOT SET');
    console.info('   - VAPID Key exists:', !!vapidKey);
    console.info('   - VAPID Key:', vapidKey === 'undefined' ? 'STRING "undefined"' : (vapidKey ? 'Present' : 'NOT SET'));
    
    // 3. Service Worker Firebase config
    console.info('%c3. Service Worker Config (expected):', 'color: blue; font-weight: bold');
    const currentDomain = window.location.hostname;
    
    if (currentDomain === 'freedi.tech' || currentDomain === 'delib.web.app') {
        console.info('   - Expected: Development config (synthesistalyaron)');
        console.info('   - Project ID: synthesistalyaron');
        console.info('   - Sender ID: 799655218679');
    } else if (currentDomain === 'freedi-test.web.app') {
        console.info('   - Expected: Production config (freedi-test)');
        console.info('   - Project ID: freedi-test');
        console.info('   - Sender ID: 47037334917');
    } else {
        console.info('   - ⚠️  Unknown domain! Using fallback config');
        console.info('   - Project ID: freedi-test (fallback)');
        console.info('   - Sender ID: 47037334917 (fallback)');
    }
    
    // 4. Check for config mismatch
    console.info('%c4. Configuration Match Check:', 'color: orange; font-weight: bold');
    
    let expectedProjectId = '';
    let expectedSenderId = '';
    
    if (currentDomain === 'freedi.tech' || currentDomain === 'delib.web.app') {
        expectedProjectId = 'synthesistalyaron';
        expectedSenderId = '799655218679';
    } else if (currentDomain === 'freedi-test.web.app') {
        expectedProjectId = 'freedi-test';
        expectedSenderId = '47037334917';
    } else {
        expectedProjectId = 'freedi-test'; // fallback
        expectedSenderId = '47037334917';
    }
    
    const projectIdMatch = firebaseConfig.projectId === expectedProjectId;
    const senderIdMatch = firebaseConfig.messagingSenderId === expectedSenderId;
    
    console.info(`   - Project ID match: ${projectIdMatch ? '✅' : '❌'} (app: ${firebaseConfig.projectId}, sw: ${expectedProjectId})`);
    console.info(`   - Sender ID match: ${senderIdMatch ? '✅' : '❌'} (app: ${firebaseConfig.messagingSenderId}, sw: ${expectedSenderId})`);
    
    if (!projectIdMatch || !senderIdMatch) {
        console.error('%c   ❌ CRITICAL: Firebase config mismatch!', 'color: red; font-weight: bold');
        console.error('   The service worker and main app are using different Firebase projects!');
        console.error('   This will cause FCM tokens to be invalid.');
    }
    
    // 5. Check service worker registration
    console.info('%c5. Service Worker Status:', 'color: blue; font-weight: bold');
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const firebaseSW = registrations.find(r => r.active?.scriptURL.includes('firebase-messaging-sw.js'));
        
        if (firebaseSW) {
            console.info('   - Firebase SW: ✅ Registered');
            console.info('   - Scope:', firebaseSW.scope);
            console.info('   - State:', firebaseSW.active?.state);
            
            // Try to communicate with SW
            if (firebaseSW.active) {
                console.info('   - Sending test message to SW...');
                firebaseSW.active.postMessage({ type: 'PING' });
            }
        } else {
            console.error('   - Firebase SW: ❌ Not found');
        }
    }
    
    // 6. Recommendations
    console.info('%c6. Recommendations:', 'color: purple; font-weight: bold');
    
    if (!projectIdMatch || !senderIdMatch) {
        console.info('   1. Update firebase-messaging-sw.js to include config for:', currentDomain);
        console.info('   2. Or ensure your deployment uses one of the configured domains');
        console.info('   3. Make sure environment variables match the service worker config');
    }
    
    if (!vapidKey || vapidKey === 'undefined') {
        console.info('   - Add VAPID key to your deployment environment variables');
    }
    
    // 7. Test notification permission
    console.info('%c7. Quick Tests:', 'color: green; font-weight: bold');
    console.info('   - Notification permission:', Notification.permission);
    
    if (Notification.permission === 'granted') {
        console.info('   - Run: await testNotificationSend() to test local notifications');
        console.info('   - Run: await debugGroupNotifications() to check subscriptions');
    }
    
    console.info('%c=== END DEBUG ===', 'color: red; font-weight: bold; font-size: 16px');
}

// Add to window
if (typeof window !== 'undefined') {
    (window as { debugDeploymentNotifications?: typeof debugDeploymentNotifications }).debugDeploymentNotifications = debugDeploymentNotifications;
}