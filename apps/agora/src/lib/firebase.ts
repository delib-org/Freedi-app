import { initializeApp, getApps, getApp, FirebaseApp, FirebaseError } from 'firebase/app';
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
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	Unsubscribe,
	DocumentReference,
	CollectionReference,
	QueryConstraint,
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
	signInWithCredential,
	signInWithCustomToken,
	GoogleAuthProvider,
	signInWithPopup as fbSignInWithPopup,
	signInWithRedirect as fbSignInWithRedirect,
	getRedirectResult as fbGetRedirectResult,
	linkWithPopup as fbLinkWithPopup,
	onAuthStateChanged,
	signOut,
	User,
} from 'firebase/auth';
import { popupResolver, warmPopupResolver as warmSharedResolver } from './popupResolver';
import {
	getFunctions,
	Functions,
	connectFunctionsEmulator,
	httpsCallable,
} from 'firebase/functions';
import {
	getStorage,
	FirebaseStorage,
	connectStorageEmulator,
	ref as storageRef,
	uploadBytesResumable,
	getDownloadURL,
	UploadTask,
} from 'firebase/storage';

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
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let functions: Functions;
let storage: FirebaseStorage;

/**
 * Emulator ports.
 *
 * Hardcoded for years, which was fine until two checkouts wanted emulators at
 * once: only one process can own a port, so the second worktree's app silently
 * talked to the first worktree's functions and new callables came back 404.
 * The defaults are the ports everything already uses — the overrides exist so
 * a second stack can be run alongside without editing this file.
 */
const emulatorPort = (name: string, fallback: number): number => {
	const configured = import.meta.env[`VITE_EMULATOR_${name}_PORT`];

	return configured ? Number(configured) : fallback;
};

/**
 * Auth WITHOUT a default popup/redirect resolver.
 *
 * `getAuth()` installs `browserPopupRedirectResolver`, which makes Firebase
 * load an auth iframe (iframe.js ~93 kB) plus the gapi script (~35 kB) as soon
 * as the page starts. Most visitors are students who sign in anonymously and
 * never open a popup, so the resolver is passed explicitly where a popup or
 * redirect is actually used (wrappers below) and the iframe is warmed once a
 * teacher/supervisor route is entered (`prepareGoogleSignIn`) so a Google click
 * does not have to await an iframe download before `window.open`, which can
 * get the popup blocked.
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

const PENDING_REDIRECT_KEY = 'agora_pending_redirect';

/**
 * Start loading the sign-in iframe. Called when a screen that offers Google
 * sign-in (teacher / supervisor routes) is entered, so it is ready by the time
 * the button is pressed. Students never call it. Idempotent.
 */
export function prepareGoogleSignIn(): void {
	void warmSharedResolver(auth);
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

/** Remembers that a redirect is in flight so the far side knows to collect it. */
export async function signInWithRedirect(
	authInstance: Auth,
	provider: AuthProvider,
): Promise<never> {
	try {
		localStorage.setItem(PENDING_REDIRECT_KEY, '1');
	} catch {
		// Storage blocked: the redirect still works for browsers that allow it
		// on return, we just can't skip the check on ordinary loads.
	}

	return fbSignInWithRedirect(authInstance, provider, popupResolver);
}

/**
 * Collects a finished redirect sign-in. Cheap on every other load: with no
 * redirect pending it resolves null WITHOUT touching the auth iframe, which is
 * what keeps that iframe off the first-load path.
 */
export async function getRedirectResult(authInstance: Auth): Promise<UserCredential | null> {
	let pending = false;

	try {
		pending = localStorage.getItem(PENDING_REDIRECT_KEY) === '1';
		if (pending) localStorage.removeItem(PENDING_REDIRECT_KEY);
	} catch {
		pending = true;
	}

	if (!pending) return null;

	return fbGetRedirectResult(authInstance, popupResolver);
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
	storage = getStorage(app);

	const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

	if (isLocalhost) {
		try {
			connectAuthEmulator(auth, `http://localhost:${emulatorPort('AUTH', 9099)}`, {
				disableWarnings: true,
			});
		} catch (error) {
			console.error('[Firebase] Auth emulator connection failed:', error);
		}
		try {
			connectFirestoreEmulator(db, 'localhost', emulatorPort('FIRESTORE', 8081));
		} catch (error) {
			console.error('[Firebase] Firestore emulator connection failed:', error);
		}
		try {
			connectFunctionsEmulator(functions, 'localhost', emulatorPort('FUNCTIONS', 5001));
		} catch (error) {
			console.error('[Firebase] Functions emulator connection failed:', error);
		}
		try {
			connectStorageEmulator(storage, 'localhost', emulatorPort('STORAGE', 9199));
		} catch (error) {
			console.error('[Firebase] Storage emulator connection failed:', error);
		}
	}
}

init();

/**
 * True when Firebase's redirect sign-in can actually finish on this origin.
 *
 * The redirect handler runs on the auth domain and leaves the credential in
 * that domain's storage; the app then reads it back through a hidden iframe
 * pointed at the same domain. Under third-party storage partitioning that
 * iframe is handed a separate, empty store, so getRedirectResult() resolves
 * to null and the teacher lands back on a signed-out page having watched
 * Google's screen take over their tab for nothing. Only an auth domain that
 * IS this origin escapes that — which agora-wizcol.web.app, served against
 * wizcol-app.firebaseapp.com, is not.
 */
function canCompleteRedirectSignIn(): boolean {
	return typeof window !== 'undefined' && window.location.hostname === firebaseConfig.authDomain;
}

export {
	canCompleteRedirectSignIn,
	app,
	db,
	auth,
	functions,
	storage,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	httpsCallable,
	signInAnonymously,
	signInWithCredential,
	signInWithCustomToken,
	GoogleAuthProvider,
	onAuthStateChanged,
	signOut,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
};

export type { UploadTask };

export type {
	User,
	Unsubscribe,
	DocumentReference,
	CollectionReference,
	QueryConstraint,
	FirebaseError,
};
