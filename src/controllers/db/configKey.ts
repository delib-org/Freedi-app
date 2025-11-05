// Helper function to safely get environment variables (compatible with both Vite and Jest)
function getEnvVar(key: string): string | undefined {
	// In test environment, use process.env
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
		return process.env[key];
	}
	// In browser/Vite environment, use import.meta.env
	// Use eval to avoid syntax errors in test environment
	try {
		// eslint-disable-next-line no-eval
		const envObj = eval('import.meta.env');
		return envObj[key] as string | undefined;
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
