/**
 * Keep this entry dependency-free. Signed-out visitors should not download the
 * application, Firestore, Redux, monitoring or PWA code to see the landing page.
 */
import { loadLanguageData, DEFAULT_LANGUAGE, isValidLanguage } from '@freedi/shared-i18n';
import { hasPersistedFirebaseUser } from './utils/persistedAuthUser';
import { LocalStorageObjects } from './types/localStorage/LocalStorageObjects';

/**
 * Origins the signed-in app talks to before it can show any data: reCAPTCHA
 * (App Check) scripts, the App Check token exchange, Auth's account lookup and
 * token refresh, and Firestore. On slow 4G every new origin costs DNS + TCP +
 * TLS (~3 round trips, ~1.7 s) and the app used to discover them one after
 * another, only once app-main.js had finished downloading. Opening them now
 * overlaps that setup with the app download.
 *
 * Scripts are fetched in no-cors mode (credentialed connection pool); the
 * Firebase REST/WebChannel calls are anonymous CORS requests, which use a
 * separate pool and need `crossorigin` on the hint to share the connection.
 */
const SCRIPT_ORIGINS = ['https://www.google.com', 'https://www.gstatic.com'];
const API_ORIGINS = [
	'https://content-firebaseappcheck.googleapis.com',
	'https://identitytoolkit.googleapis.com',
	'https://securetoken.googleapis.com',
	'https://firestore.googleapis.com',
];
// The exact URL App Check's ReCaptchaV3Provider injects as a classic script.
const RECAPTCHA_SCRIPT_URL = 'https://www.google.com/recaptcha/api.js';

function addHint(rel: string, href: string, attributes: Record<string, string> = {}): void {
	const link = document.createElement('link');
	link.rel = rel;
	link.href = href;
	Object.entries(attributes).forEach(([name, value]) => link.setAttribute(name, value));
	document.head.append(link);
}

function warmUpSignedInConnections(): void {
	// Locally the app talks to the emulators and App Check is off.
	if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) return;

	SCRIPT_ORIGINS.forEach((origin) => addHint('preconnect', origin));
	API_ORIGINS.forEach((origin) => addHint('preconnect', origin, { crossorigin: 'anonymous' }));
	addHint('preload', RECAPTCHA_SCRIPT_URL, { as: 'script' });
}

/**
 * Start the reader's dictionary chunk alongside app-main.js instead of after
 * it: app-main asks for the same language, and the loader caches the promise.
 */
function warmUpDictionary(): void {
	try {
		const savedConfig = localStorage.getItem(LocalStorageObjects.UserConfig);
		const parsed: { chosenLanguage?: string } = savedConfig ? JSON.parse(savedConfig) : {};
		const lang = parsed.chosenLanguage;
		void loadLanguageData(lang && isValidLanguage(lang) ? lang : DEFAULT_LANGUAGE);
	} catch {
		void loadLanguageData(DEFAULT_LANGUAGE);
	}
}

const isLandingPath = location.pathname === '/' || location.pathname === '/start';
const isSignedIn = hasPersistedFirebaseUser();

if (isLandingPath && !isSignedIn) {
	void import('./landing-main');
} else {
	warmUpDictionary();
	if (isSignedIn) warmUpSignedInConnections();
	// A known signed-in visitor at the marketing URL can skip its component and
	// dictionary entirely. Firebase still verifies the session in the full app.
	if (isLandingPath) history.replaceState(null, '', '/home');
	void import('./app-main');
}
