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
	Auth,
	connectAuthEmulator,
	signInAnonymously,
	signInWithCredential,
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
		try {
			connectStorageEmulator(storage, 'localhost', 9199);
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
	GoogleAuthProvider,
	signInWithPopup,
	linkWithPopup,
	onAuthStateChanged,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
};

export type { UploadTask };

export type { User, Unsubscribe, DocumentReference, CollectionReference, QueryConstraint };
