// Helper to safely get environment variables (compatible with both Vite and Jest)
// Note: In production build, Vite will statically replace import.meta.env references
// In tests, we use process.env to avoid syntax errors
function getEnvVar(key: string): string | undefined {
	// In test environment, use process.env
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
		return process.env[key];
	}
	// In browser/Vite environment, try to access import.meta.env
	// We use a try-catch with indirect eval to handle both dev and prod
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const getMetaEnv = new Function('key', 'return import.meta.env[key]');
		return getMetaEnv(key);
	} catch {
		return undefined;
	}
}

const firebaseConfig = {
	apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
	authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
	databaseURL: getEnvVar('VITE_FIREBASE_DATABASE_URL'),
	projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
	storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
	messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
	appId: getEnvVar('VITE_FIREBASE_APP_ID'),
	measurementId: getEnvVar('VITE_FIREBASE_MEASUREMENT_ID'),
};

const vapidKeys = getEnvVar('VITE_FIREBASE_VAPID_KEY');

export const vapidKey = vapidKeys;

export default firebaseConfig;
