import { notificationService } from '@/services/notificationService';
import { auth } from '@/controllers/db/config';

export async function checkNotificationStatus() {
    console.info('%c=== NOTIFICATION STATUS CHECK ===', 'color: blue; font-weight: bold; font-size: 16px');
    
    // 1. Check current singleton state
    console.info('%c1. Current Service State:', 'color: green; font-weight: bold');
    const currentToken = notificationService.getToken();
    const currentUserId = notificationService.getCurrentUserId();
    const isInitialized = notificationService.isInitialized();
    
    console.info('Service State:', {
        isInitialized,
        hasToken: !!currentToken,
        tokenPreview: currentToken ? currentToken.substring(0, 30) + '...' : 'none',
        userId: currentUserId || 'not set'
    });
    
    // 2. Check Firebase Auth
    console.info('%c2. Firebase Auth State:', 'color: green; font-weight: bold');
    const user = auth.currentUser;
    console.info('Auth State:', {
        isAuthenticated: !!user,
        userId: user?.uid || 'not logged in',
        email: user?.email || 'not logged in'
    });
    
    // 3. If user is logged in but service not initialized, try to initialize
    if (user && !isInitialized) {
        console.info('%c3. Initializing Notification Service...', 'color: orange; font-weight: bold');
        try {
            await notificationService.initialize(user.uid);
            const newToken = notificationService.getToken();
            console.info('Initialization Result:', {
                success: !!newToken,
                tokenPreview: newToken ? newToken.substring(0, 30) + '...' : 'failed'
            });
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    } else if (!user) {
        console.info('%c3. Cannot initialize - user not logged in', 'color: red; font-weight: bold');
    } else {
        console.info('%c3. Service already initialized', 'color: green; font-weight: bold');
    }
    
    // 4. Get full diagnostics
    console.info('%c4. Full Diagnostics:', 'color: green; font-weight: bold');
    try {
        const diagnostics = await notificationService.getDiagnostics();
        console.info('Diagnostics:', JSON.stringify({
            ...diagnostics,
            tokenPreview: diagnostics.token ? diagnostics.token.substring(0, 30) + '...' : 'none',
            token: undefined // Hide full token
        }, null, 2));
    } catch (error) {
        console.error('Error getting diagnostics:', error);
    }
    
    console.info('%c=== END STATUS CHECK ===', 'color: blue; font-weight: bold; font-size: 16px');
}

// Add function to manually refresh token
export async function refreshNotificationToken() {
    console.info('=== REFRESH NOTIFICATION TOKEN ===');
    
    const user = auth.currentUser;
    if (!user) {
        console.error('No user logged in');
        return;
    }
    
    try {
        console.info('Forcing token refresh...');
        const newToken = await notificationService.getOrRefreshToken(user.uid, true);
        console.info('Refresh result:', {
            success: !!newToken,
            tokenPreview: newToken ? newToken.substring(0, 30) + '...' : 'failed'
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
    }
}

// Add to window for easy access
if (typeof window !== 'undefined') {
    (window as { 
        checkNotificationStatus?: typeof checkNotificationStatus;
        refreshNotificationToken?: typeof refreshNotificationToken;
    }).checkNotificationStatus = checkNotificationStatus;
    (window as { 
        checkNotificationStatus?: typeof checkNotificationStatus;
        refreshNotificationToken?: typeof refreshNotificationToken;
    }).refreshNotificationToken = refreshNotificationToken;
}