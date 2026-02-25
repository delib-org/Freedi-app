import { notificationService } from '@/services/notificationService';
import { auth } from '@/controllers/db/config';
import { logError } from '@/utils/errorHandling';

export async function checkNotificationStatus() {
	console.info('=== NOTIFICATION STATUS CHECK ===');

	// 1. Check current singleton state
	console.info('1. Current Service State:');
	const currentToken = notificationService.getToken();
	const currentUserId = notificationService.getCurrentUserId();
	const isInitialized = notificationService.isInitialized();

	console.info('Service State:', {
		isInitialized,
		hasToken: !!currentToken,
		tokenPreview: currentToken ? currentToken.substring(0, 30) + '...' : 'none',
		userId: currentUserId || 'not set',
	});

	// 2. Check Firebase Auth
	console.info('2. Firebase Auth State:');
	const user = auth.currentUser;
	console.info('Auth State:', {
		isAuthenticated: !!user,
		userId: user?.uid || 'not logged in',
		email: user?.email || 'not logged in',
	});

	// 3. If user is logged in but service not initialized, try to initialize
	if (user && !isInitialized) {
		console.info('3. Initializing Notification Service...');
		try {
			await notificationService.initialize(user.uid);
			const newToken = notificationService.getToken();
			console.info('Initialization Result:', {
				success: !!newToken,
				tokenPreview: newToken ? newToken.substring(0, 30) + '...' : 'failed',
			});
		} catch (error) {
			logError(error, {
				operation: 'utils.notificationStatus.unknown',
				metadata: { message: 'Failed to initialize:' },
			});
		}
	} else if (!user) {
		console.info('3. Cannot initialize - user not logged in');
	} else {
		console.info('3. Service already initialized');
	}

	// 4. Get full diagnostics
	console.info('4. Full Diagnostics:');
	try {
		const diagnostics = await notificationService.getDiagnostics();
		console.info('Diagnostics:', {
			data: JSON.stringify(
				{
					...diagnostics,
					tokenPreview: diagnostics.token ? diagnostics.token.substring(0, 30) + '...' : 'none',
					token: undefined, // Hide full token
				},
				null,
				2,
			),
		});
	} catch (error) {
		logError(error, {
			operation: 'utils.notificationStatus.unknown',
			metadata: { message: 'Error getting diagnostics:' },
		});
	}

	console.info('=== END STATUS CHECK ===');
}

// Add function to manually refresh token
export async function refreshNotificationToken() {
	console.info('=== REFRESH NOTIFICATION TOKEN ===');

	const user = auth.currentUser;
	if (!user) {
		logError(new Error('No user logged in'), {
			operation: 'utils.notificationStatus.refreshNotificationToken',
		});

		return;
	}

	try {
		console.info('Forcing token refresh...');
		const newToken = await notificationService.getOrRefreshToken(user.uid, true);
		console.info('Refresh result:', {
			success: !!newToken,
			tokenPreview: newToken ? newToken.substring(0, 30) + '...' : 'failed',
		});
	} catch (error) {
		logError(error, {
			operation: 'utils.notificationStatus.refreshNotificationToken',
			metadata: { message: 'Error refreshing token:' },
		});
	}
}

// Add to window for easy access
if (typeof window !== 'undefined') {
	(
		window as {
			checkNotificationStatus?: typeof checkNotificationStatus;
			refreshNotificationToken?: typeof refreshNotificationToken;
		}
	).checkNotificationStatus = checkNotificationStatus;
	(
		window as {
			checkNotificationStatus?: typeof checkNotificationStatus;
			refreshNotificationToken?: typeof refreshNotificationToken;
		}
	).refreshNotificationToken = refreshNotificationToken;
}
