import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { auth } from './config';
import { notificationService } from '@/services/notificationService';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';

export function googleLogin() {
	const provider = new GoogleAuthProvider();
	signInWithPopup(auth, provider)
		.then((result) => {
			logger.info('User signed in with Google', { userId: result.user.uid });

			// Track login or signup
			const isNewUser = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
			if (isNewUser) {
				analyticsService.trackUserSignup('google');
			} else {
				analyticsService.trackUserLogin('google');
			}
		})
		.catch((error) => {
			logger.error('Google login failed', error);
			analyticsService.trackValidationError('google_login_failed', 'auth');
		});
}

export const logOut = async () => {
	try {
		// Track logout before cleaning up
		analyticsService.trackUserLogout();

		// Sign out from Firebase Auth immediately for better UX
		await auth.signOut();

		// Clean up notifications in the background (non-blocking)
		notificationService.cleanup().catch((error) => {
			logger.error('Error cleaning up notifications', error);
		});

		logger.info('User logged out successfully');
	} catch (error) {
		logger.error('Error during logout', error);
	}
};

export function signAnonymously() {
	signInAnonymously(auth)
		.then((result) => {
			logger.info('User signed in anonymously', { userId: result.user.uid });
			analyticsService.trackUserLogin('anonymous');
		})
		.catch((error) => {
			logger.error('Anonymous login failed', error);
			analyticsService.trackValidationError('anonymous_login_failed', 'auth');
		});
}
