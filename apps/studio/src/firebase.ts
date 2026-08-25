import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// All WizCol Cloud Functions live in me-west1 (Tel Aviv) — never the default region.
export const functions = getFunctions(app, 'me-west1');

// Wire local emulators when explicitly enabled. Defaults match firebase.json
// (auth 9099, firestore 8081, functions 5001); the VITE_EMULATOR_*_PORT
// overrides let Studio target an alternate-port suite (firebase.altports2.json)
// when another worktree already holds the default ports.
function emulatorPort(value: string | undefined, fallback: number): number {
	const parsed = Number(value);

	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
	const authPort = emulatorPort(import.meta.env.VITE_EMULATOR_AUTH_PORT, 9099);
	const firestorePort = emulatorPort(import.meta.env.VITE_EMULATOR_FIRESTORE_PORT, 8081);
	const functionsPort = emulatorPort(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT, 5001);
	connectAuthEmulator(auth, `http://localhost:${authPort}`, { disableWarnings: true });
	connectFirestoreEmulator(db, 'localhost', firestorePort);
	connectFunctionsEmulator(functions, 'localhost', functionsPort);
}

export default app;
