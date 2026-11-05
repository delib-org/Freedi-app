import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { logError } from '@freedi/shared-utils';

// Functions deploy to me-west1 (Tel Aviv): never rely on the us-central1 default.
const FUNCTIONS_REGION = 'me-west1';

const DEFAULT_AUTH_EMULATOR_PORT = 9099;
const DEFAULT_FUNCTIONS_EMULATOR_PORT = 5001;
const DEFAULT_FIRESTORE_EMULATOR_PORT = 8081;

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** The local dev / e2e host, where Firebase services talk to the emulators. */
export function isLocalhost(): boolean {
	return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}

/**
 * An emulator port. Defaults to the repo's main suite; a worktree running its own
 * suite (npm run emulators:solo) points the bundle at it with VITE_EMULATOR_*_PORT.
 */
export function emulatorPort(raw: string | undefined, fallback: number): number {
	const parsed = raw ? Number(raw) : NaN;

	return Number.isFinite(parsed) ? parsed : fallback;
}

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const functions: Functions = getFunctions(app, FUNCTIONS_REGION);

if (isLocalhost()) {
	try {
		connectAuthEmulator(
			auth,
			`http://localhost:${emulatorPort(import.meta.env.VITE_EMULATOR_AUTH_PORT, DEFAULT_AUTH_EMULATOR_PORT)}`,
			{ disableWarnings: true },
		);
		connectFirestoreEmulator(
			db,
			'localhost',
			emulatorPort(import.meta.env.VITE_EMULATOR_FIRESTORE_PORT, DEFAULT_FIRESTORE_EMULATOR_PORT),
		);
		connectFunctionsEmulator(
			functions,
			'localhost',
			emulatorPort(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT, DEFAULT_FUNCTIONS_EMULATOR_PORT),
		);
	} catch (error) {
		logError(error, { operation: 'tables.firebase.connectEmulators' });
	}
}

export { app, auth, db, functions };
