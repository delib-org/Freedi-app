/**
 * Lazy client Firebase factories. NONE of this is in the first HTML payload —
 * `firebase/*` is dynamically imported only when live updates are wired up
 * (`onMount` in `realtime.ts`), satisfying the "no Firebase in first paint"
 * guarantee (§2 of the plan).
 *
 *  - `firestore()`        — public/unlisted: `firebase/app` + `firebase/firestore`
 *                            only (rules allow anonymous read, no auth SDK).
 *  - `firestoreAuthed()`  — private: additionally loads `firebase/auth` because
 *                            the read rule requires `request.auth.uid`.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let appPromise: Promise<FirebaseApp> | null = null;
let dbPromise: Promise<Firestore> | null = null;
let authPromise: Promise<Auth> | null = null;

const isLocalhost = (): boolean =>
	typeof window !== 'undefined' && window.location.hostname === 'localhost';

async function getApp(): Promise<FirebaseApp> {
	if (!appPromise) {
		appPromise = (async () => {
			const { initializeApp, getApps, getApp } = await import('firebase/app');

			return getApps().length ? getApp() : initializeApp(firebaseConfig);
		})();
	}

	return appPromise;
}

/** Public/unlisted realtime — Firestore without the auth SDK. */
export async function firestore(): Promise<Firestore> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const app = await getApp();
			const { getFirestore, initializeFirestore, connectFirestoreEmulator } = await import(
				'firebase/firestore'
			);

			if (isLocalhost()) {
				// Use 127.0.0.1 (not 'localhost'): browsers often resolve 'localhost'
				// to IPv6 ::1, but the emulator listens on IPv4, so the listener never
				// connects. Long polling additionally avoids the emulator's flaky
				// WebChannel bidi stream.
				const db = initializeFirestore(app, { experimentalForceLongPolling: true });
				try {
					connectFirestoreEmulator(db, '127.0.0.1', 8081);
				} catch {
					/* already connected */
				}

				return db;
			}

			return getFirestore(app);
		})();
	}

	return dbPromise;
}

/** Firebase Auth client (private tier only). Persists in IndexedDB. */
export async function auth(): Promise<Auth> {
	if (!authPromise) {
		authPromise = (async () => {
			const app = await getApp();
			const { getAuth, connectAuthEmulator } = await import('firebase/auth');
			const a = getAuth(app);
			if (isLocalhost()) {
				try {
					connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
				} catch {
					/* already connected */
				}
			}

			return a;
		})();
	}

	return authPromise;
}

/** Private realtime — Firestore + auth so `onSnapshot` runs authenticated. */
export async function firestoreAuthed(): Promise<{ db: Firestore; auth: Auth }> {
	const [db, a] = await Promise.all([firestore(), auth()]);

	return { db, auth: a };
}
