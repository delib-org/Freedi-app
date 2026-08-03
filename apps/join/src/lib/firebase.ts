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
	Auth,
	connectAuthEmulator,
	signInAnonymously,
	GoogleAuthProvider,
	signInWithPopup,
	linkWithPopup,
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

function init(): void {
	if (getApps().length > 0) {
		app = getApp();
	} else {
		app = initializeApp(firebaseConfig);
	}

	db = getFirestore(app);
	auth = getAuth(app);
	functions = getFunctions(app, FUNCTIONS_REGION);

	const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

	if (import.meta.env.VITE_FIREBASE_DATABASE_URL) {
		rtdb = getDatabase(app);
		if (isLocalhost) {
			try {
				connectDatabaseEmulator(rtdb, 'localhost', 9000);
			} catch (error) {
				console.error('[Firebase] Database emulator connection failed:', error);
			}
		}
	}

	if (isLocalhost) {
		try {
			connectAuthEmulator(auth, 'http://localhost:9099', {
				disableWarnings: true,
			});
		} catch (error) {
			console.error('[Firebase] Auth emulator connection failed:', error);
		}
		try {
			connectFirestoreEmulator(db, 'localhost', 8081);
		} catch (error) {
			console.error('[Firebase] Firestore emulator connection failed:', error);
		}
		try {
			connectFunctionsEmulator(functions, 'localhost', 5001);
		} catch (error) {
			console.error('[Firebase] Functions emulator connection failed:', error);
		}
	}
}

init();

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
	signInWithPopup,
	linkWithPopup,
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
