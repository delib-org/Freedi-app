import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
	getFirestore,
	Firestore,
	connectFirestoreEmulator,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	onSnapshot,
	runTransaction,
	writeBatch,
	deleteField,
	DocumentReference,
	CollectionReference,
	QueryConstraint,
	Unsubscribe,
} from 'firebase/firestore';
import {
	getAuth,
	initializeAuth,
	indexedDBLocalPersistence,
	browserLocalPersistence,
	Auth,
	AuthProvider,
	UserCredential,
	connectAuthEmulator,
	signInAnonymously,
	GoogleAuthProvider,
	signInWithPopup as fbSignInWithPopup,
	linkWithPopup as fbLinkWithPopup,
	onAuthStateChanged,
	User,
} from 'firebase/auth';
import { afterLoad } from './deferWork';
import { popupResolver, warmPopupResolver as warmSharedResolver } from './popupResolver';
import {
	getFunctions,
	Functions,
	connectFunctionsEmulator,
	httpsCallable,
} from 'firebase/functions';
import {
	getDatabase,
	connectDatabaseEmulator,
	Database,
	ref as rtdbRef,
	set as rtdbSet,
	update as rtdbUpdate,
	remove as rtdbRemove,
	onValue as rtdbOnValue,
	onDisconnect as rtdbOnDisconnect,
	OnDisconnect,
	DatabaseReference,
	Unsubscribe as RtdbUnsubscribe,
} from 'firebase/database';

// Functions deploy to me-west1 (Tel Aviv) — never rely on the us-central1 default.
const FUNCTIONS_REGION = 'me-west1';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let functions: Functions;
// Realtime Database powers keystroke-rate features (live draft broadcast).
// Null when VITE_FIREBASE_DATABASE_URL is absent — those features no-op.
let rtdb: Database | null = null;

/**
 * Auth WITHOUT a default popup/redirect resolver.
 *
 * `getAuth()` installs `browserPopupRedirectResolver`, which makes Firebase load
 * an auth iframe (iframe.js ~93 kB) plus the gapi script (~35 kB) at startup —
 * on slow 4G that is the biggest late request, and guests (the common case)
 * never open a popup. Instead the resolver is passed explicitly at the popup
 * call sites below, and warmed up once the page is idle so the first Google
 * click doesn't have to await an iframe load before `window.open` (which could
 * make browsers block the popup).
 */
function createAuth(firebaseApp: FirebaseApp): Auth {
	try {
		return initializeAuth(firebaseApp, {
			persistence: [indexedDBLocalPersistence, browserLocalPersistence],
		});
	} catch {
		// Already initialised (HMR / second init) — reuse it.
		return getAuth(firebaseApp);
	}
}

/** Pre-load the popup iframe off the critical path, via the resolver singleton
 *  Firebase caches per class. Resolves null: no redirect is ever started here. */
function warmPopupResolver(): void {
	afterLoad(() => {
		void warmSharedResolver(auth);
	}, 5000);
}

export function signInWithPopup(
	authInstance: Auth,
	provider: AuthProvider,
): Promise<UserCredential> {
	return fbSignInWithPopup(authInstance, provider, popupResolver);
}

export function linkWithPopup(user: User, provider: AuthProvider): Promise<UserCredential> {
	return fbLinkWithPopup(user, provider, popupResolver);
}

function init(): void {
	if (getApps().length > 0) {
		app = getApp();
	} else {
		app = initializeApp(firebaseConfig);
	}

	db = getFirestore(app);
	auth = createAuth(app);
	functions = getFunctions(app, FUNCTIONS_REGION);

	const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
	// Emulator ports default to the repo's main suite; a worktree running its own
	// suite (npm run emulators:solo) points the bundle at it with these.
	const emuPort = (name: string, fallback: number): number => {
		const raw = (import.meta.env as Record<string, string | undefined>)[name];
		const parsed = raw ? Number(raw) : NaN;

		return Number.isFinite(parsed) ? parsed : fallback;
	};

	if (import.meta.env.VITE_FIREBASE_DATABASE_URL) {
		rtdb = getDatabase(app);
		if (isLocalhost) {
			try {
				connectDatabaseEmulator(rtdb, 'localhost', emuPort('VITE_EMULATOR_DATABASE_PORT', 9000));
			} catch (error) {
				console.error('[Firebase] Database emulator connection failed:', error);
			}
		}
	}

	if (isLocalhost) {
		try {
			connectAuthEmulator(auth, `http://localhost:${emuPort('VITE_EMULATOR_AUTH_PORT', 9099)}`, {
				disableWarnings: true,
			});
		} catch (error) {
			console.error('[Firebase] Auth emulator connection failed:', error);
		}
		try {
			connectFirestoreEmulator(db, 'localhost', emuPort('VITE_EMULATOR_FIRESTORE_PORT', 8081));
		} catch (error) {
			console.error('[Firebase] Firestore emulator connection failed:', error);
		}
		try {
			connectFunctionsEmulator(
				functions,
				'localhost',
				emuPort('VITE_EMULATOR_FUNCTIONS_PORT', 5001),
			);
		} catch (error) {
			console.error('[Firebase] Functions emulator connection failed:', error);
		}
	}
}

init();
warmPopupResolver();

export {
	app,
	db,
	auth,
	functions,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	onSnapshot,
	runTransaction,
	writeBatch,
	deleteField,
	httpsCallable,
	signInAnonymously,
	GoogleAuthProvider,
	onAuthStateChanged,
	rtdbRef,
	rtdbSet,
	rtdbUpdate,
	rtdbRemove,
	rtdbOnValue,
	rtdbOnDisconnect,
};

export function getRtdb(): Database | null {
	return rtdb;
}

export type {
	User,
	DocumentReference,
	CollectionReference,
	QueryConstraint,
	Unsubscribe,
	Database,
	DatabaseReference,
	OnDisconnect,
	RtdbUnsubscribe,
};
