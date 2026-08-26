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
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	writeBatch,
	Unsubscribe,
} from 'firebase/firestore';
import {
	getAuth,
	Auth,
	connectAuthEmulator,
	GoogleAuthProvider,
	signInWithPopup,
	signInAnonymously,
	signOut,
	onAuthStateChanged,
	User,
} from 'firebase/auth';
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
	uploadBytes,
	getDownloadURL,
} from 'firebase/storage';

// Same wiring as apps/agora: config from generated .env.local, and automatic
// emulator connection on localhost.
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

/** Every Freedi function lives in Tel Aviv; the default region would 404. */
const FUNCTIONS_REGION = 'me-west1';

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

function init(): void {
	if (getApps().length > 0) {
		app = getApp();
	} else {
		app = initializeApp(firebaseConfig);
	}

	db = getFirestore(app);
	auth = getAuth(app);
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

export {
	app,
	db,
	auth,
	functions,
	httpsCallable,
	storage,
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	onSnapshot,
	query,
	where,
	orderBy,
	limit,
	writeBatch,
	GoogleAuthProvider,
	signInWithPopup,
	signInAnonymously,
	signOut,
	onAuthStateChanged,
	storageRef,
	uploadBytes,
	getDownloadURL,
};

export type { User, Unsubscribe };
