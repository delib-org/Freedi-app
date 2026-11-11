import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';
import { logError } from '@freedi/shared-utils';

/**
 * Firebase App Check for the browser, after src/controllers/db/appCheck.ts of the main app.
 * The reCAPTCHA v3 key is public by design: it only works on the domains added to it.
 * Servers do not enforce App Check yet, so a failure here must never stop the app.
 */
const RECAPTCHA_SITE_KEY: string =
	import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY || '6LdJdS0sAAAAAG-UGQ9QEzNAcHgYKS7QzTKkqJMn';

const PRODUCTION_HOSTS: readonly string[] = ['tables.wizcol.com', 'wizcol-tables.web.app'];
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

export type AppCheckMode = 'production' | 'debug' | 'off';

/** Production hosts verify with reCAPTCHA, localhost uses a debug token, anything else is left alone. */
export function appCheckModeFor(hostname: string): AppCheckMode {
	if (PRODUCTION_HOSTS.includes(hostname)) return 'production';
	if (LOCAL_HOSTS.includes(hostname)) return 'debug';

	return 'off';
}

interface DebugTokenHost {
	FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
}

/** Call before any other Firebase service is created. Returns null when skipped or failed. */
export function initializeTablesAppCheck(app: FirebaseApp): AppCheck | null {
	if (typeof window === 'undefined') return null;

	const mode = appCheckModeFor(window.location.hostname);

	if (mode === 'off') return null;

	try {
		if (mode === 'debug') {
			(self as unknown as DebugTokenHost).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
		}

		return initializeAppCheck(app, {
			provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
			isTokenAutoRefreshEnabled: true,
		});
	} catch (error) {
		logError(error, { operation: 'tables.appCheck.initialize', metadata: { mode } });

		return null;
	}
}
