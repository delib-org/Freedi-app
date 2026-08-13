/**
 * Lazy client Firebase factories. NONE of this is in the first HTML payload —
 * `firebase/*` is dynamically imported only when live updates are wired up
 * (`onMount` in `realtime.ts`), satisfying the "no Firebase in first paint"
 * guarantee (§2 of the plan).
 *
 *  - `firestore()`        — the bare Firestore handle, no auth SDK. Not enough
 *                            on its own to read `/statements` any more.
 *  - `firestoreAnon()`    — public/unlisted: signs in anonymously first, since
 *                            reads now require `request.auth != null`.
 *  - `firestoreAuthed()`  — private: hands back the auth instance too, for
 *                            callers that need the identity, not just a session.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';

/** Cloud Functions region for callables (matches functionConfig.region). */
export const FUNCTIONS_REGION = 'me-west1';

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
let functionsPromise: Promise<Functions> | null = null;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const isLocalhost = (): boolean =>
	typeof window !== 'undefined' && LOCAL_HOSTS.has(window.location.hostname);

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

/**
 * Public/unlisted realtime, signed in anonymously.
 *
 * Public conversations used to subscribe with no auth SDK at all, because the
 * read rule permitted it. It no longer does — a conversation being public means
 * anyone may read it, not that no one need say who they are.
 *
 * The first-paint guarantee is untouched: this still runs only from `onMount`,
 * and `firebase/auth` is still a dynamic import, so the cost lands in a
 * post-hydration chunk rather than the initial HTML payload. A reader who
 * already has a session (restored by `authStateReady`) keeps it; only a genuinely
 * signed-out reader gets an anonymous credential.
 */
export async function firestoreAnon(): Promise<Firestore> {
	const [db, a] = await Promise.all([firestore(), auth()]);
	await a.authStateReady();

	if (!a.currentUser) {
		const { signInAnonymously } = await import('firebase/auth');
		await signInAnonymously(a);
	}

	return db;
}

/**
 * Cloud Functions client for callables (AI summary/revision, invite redeem).
 * On localhost it targets the functions emulator (127.0.0.1:5001) so the real
 * functions run locally; in production it hits me-west1.
 */
export async function functionsClient(): Promise<Functions> {
	if (!functionsPromise) {
		functionsPromise = (async () => {
			const app = await getApp();
			// Initialize Auth first AND wait for the persisted user to restore, so
			// the callable attaches the user's ID token (otherwise it calls
			// anonymously → 401 even when the session cookie says we're signed in).
			const a = await auth();
			await a.authStateReady();

			const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
			const fns = getFunctions(app, FUNCTIONS_REGION);
			if (isLocalhost()) {
				try {
					connectFunctionsEmulator(fns, '127.0.0.1', 5001);
				} catch {
					/* already connected */
				}
			}

			return fns;
		})();
	}

	return functionsPromise;
}

/** Whether the client Firebase Auth SDK currently has a signed-in user. */
export async function currentUser(): Promise<{ uid: string } | null> {
	const a = await auth();
	await a.authStateReady();

	return a.currentUser ? { uid: a.currentUser.uid } : null;
}

/** Sign out of both the client Auth SDK and the server session cookie. */
export async function signOutEverywhere(): Promise<void> {
	const a = await auth();
	await a.signOut().catch(() => {
		/* ignore */
	});
	await fetch('/api/session', { method: 'DELETE' }).catch(() => {
		/* ignore */
	});
}
