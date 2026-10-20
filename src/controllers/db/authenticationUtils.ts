import {
	GoogleAuthProvider,
	browserPopupRedirectResolver,
	signInWithPopup,
	signInAnonymously,
} from 'firebase/auth';
import { auth, authNeedsReloadToSignInAgain } from './config';
import { notificationService } from '@/services/notificationService';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import { logLogout } from '@/controllers/db/researchLogs/researchLogger';

// The user dismissing the Google popup is a normal outcome, not a failure.
// Reporting these as errors filled the tracker with `auth/popup-closed-by-user`.
const CANCELLED_SIGN_IN_CODES = new Set([
	'auth/popup-closed-by-user',
	'auth/cancelled-popup-request',
	'auth/user-cancelled',
]);

export function googleLogin() {
	const provider = new GoogleAuthProvider();
	// Explicit resolver: a session that started signed in has none by default.
	signInWithPopup(auth, provider, browserPopupRedirectResolver)
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
			const code = (error as { code?: string })?.code;

			if (code && CANCELLED_SIGN_IN_CODES.has(code)) {
				logger.info('Google sign-in cancelled by user', { code });

				return;
			}

			if (code === 'auth/popup-blocked') {
				// Browser-level setting; the user needs to allow popups. Not a defect.
				logger.info('Google sign-in popup was blocked by the browser', { code });

				return;
			}

			logger.error('Google login failed', error);
			analyticsService.trackValidationError('google_login_failed', 'auth');
		});
}

export const logOut = async () => {
	try {
		// Track logout before cleaning up
		analyticsService.trackUserLogout();

		// Research log must be written while the user is still authenticated,
		// otherwise Firestore security rules reject it.
		await logLogout();

		// Sign out from Firebase Auth immediately for better UX
		await auth.signOut();

		// Clean up notifications in the background (non-blocking)
		const cleanup = notificationService.cleanup().catch((error) => {
			logger.error('Error cleaning up notifications', error);
		});

		logger.info('User logged out successfully');

		// This page started signed in, so Auth was created without the popup
		// resolver (see config.ts). On mobile/Safari the next Google sign-in
		// popup would then be blocked, because the iframe it needs loads only
		// after the tap. A fresh load starts signed out, with the resolver warm.
		if (authNeedsReloadToSignInAgain()) {
			void cleanup.finally(() => window.location.reload());
		}
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
