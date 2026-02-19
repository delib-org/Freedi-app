/**
 * Firebase App Check initialization module
 *
 * App Check provides protection against abuse by verifying that requests
 * to Firebase services come from legitimate apps.
 *
 * - In production: Uses ReCaptchaV3Provider for web verification
 * - In development (localhost): Uses debug mode with auto-generated debug token
 *
 * IMPORTANT: This module must be initialized BEFORE any other Firebase services
 * (Auth, Firestore, Storage, etc.)
 */

import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';
import { logError } from '@/utils/errorHandling';

// reCAPTCHA v3 site key for production
// This key is safe to expose in client-side code as it's tied to specific domains
const RECAPTCHA_SITE_KEY =
	import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY || '6LdJdS0sAAAAAG-UGQ9QEzNAcHgYKS7QzTKkqJMn';

// List of production domains where reCAPTCHA should be used
const PRODUCTION_DOMAINS = [
	'app.wizcol.com',
	'wizcol-app.web.app',
	'wizcol-app.firebaseapp.com',
	'freedi.app',
	'www.freedi.app',
];

/**
 * Check if the app is running in a development/localhost environment
 */
function isLocalhost(): boolean {
	if (typeof window === 'undefined') return false;

	const hostname = window.location.hostname;

	return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Check if the app is running on a production domain
 */
function isProductionDomain(): boolean {
	if (typeof window === 'undefined') return false;

	const hostname = window.location.hostname;

	return PRODUCTION_DOMAINS.includes(hostname);
}

/**
 * Initialize Firebase App Check
 *
 * @param app - The initialized Firebase app instance
 * @returns The AppCheck instance or null if initialization fails
 *
 * @example
 * ```typescript
 * import { initializeApp } from 'firebase/app';
 * import { initializeFirebaseAppCheck } from './appCheck';
 *
 * const app = initializeApp(firebaseConfig);
 * const appCheck = initializeFirebaseAppCheck(app);
 *
 * // Now initialize other Firebase services
 * const auth = getAuth(app);
 * const firestore = getFirestore(app);
 * ```
 */
export function initializeFirebaseAppCheck(app: FirebaseApp): AppCheck | null {
	// App Check is only relevant in browser environment
	if (typeof window === 'undefined') {
		console.info('App Check: Skipped - not in browser environment');

		return null;
	}

	try {
		// Enable debug mode for localhost development
		// The debug token will be logged to the console and needs to be
		// registered in Firebase Console > App Check > Manage debug tokens
		if (isLocalhost()) {
			// Set the debug token flag before initializing App Check
			// This tells Firebase to use a debug provider instead of reCAPTCHA
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
			console.info('App Check: Debug mode enabled for localhost');
			console.info(
				'App Check: Copy the debug token from the console and register it in Firebase Console',
			);
		}

		// Initialize App Check with ReCaptchaV3Provider
		// The debug token flag (set above) will make Firebase use debug mode on localhost
		const appCheck = initializeAppCheck(app, {
			provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
			isTokenAutoRefreshEnabled: true,
		});

		if (isLocalhost()) {
			console.info('App Check: Initialized with debug provider');
		} else if (isProductionDomain()) {
			console.info('App Check: Initialized with ReCaptchaV3 provider for production');
		} else {
			console.info('App Check: Initialized with ReCaptchaV3 provider');
		}

		return appCheck;
	} catch (error) {
		logError(error, { operation: 'appCheck.unknown', metadata: { message: 'App Check: Failed to initialize' } });
		// Return null but don't throw - allow the app to continue
		// Firebase services will work without App Check, just without the extra protection

		return null;
	}
}

export { RECAPTCHA_SITE_KEY, PRODUCTION_DOMAINS };
