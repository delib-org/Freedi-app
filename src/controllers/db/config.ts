// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import {
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	setPersistence,
} from 'firebase/auth';
import { 
	connectFirestoreEmulator, 
	getFirestore, 
	enableMultiTabIndexedDbPersistence,
	enableIndexedDbPersistence,
	CACHE_SIZE_UNLIMITED,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { isProduction } from '../general/helpers';
import firebaseConfig from './configKey';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const FireStore = getFirestore(app);
const DB = FireStore;
const storage = getStorage(app);
const auth = getAuth();

// Set persistence for auth
setPersistence(auth, browserLocalPersistence)
	.then(() => {
		console.info('Auth persistence set to local storage.');
	})
	.catch((error) => {
		console.error('Error setting auth persistence:', error);
	});

// Configure Firestore settings for better offline support and error handling
try {
	// Enable persistence for Firestore to improve performance and offline capabilities
	enableIndexedDbPersistence(FireStore, {
		synchronizeTabs: true
	}).catch((err) => {
		if (err.code === 'failed-precondition') {
			// Multiple tabs open, persistence can only be enabled in one tab at a time
			console.warn('Firestore persistence unavailable - multiple tabs open');
		} else if (err.code === 'unimplemented') {
			// The current browser doesn't support persistence
			console.warn('Firestore persistence not supported in this browser');
		} else {
			console.error('Firestore persistence error:', err);
		}
	});

	// Set cache size to unlimited for better offline experience
	FireStore.settings({
		cacheSizeBytes: CACHE_SIZE_UNLIMITED
	});
} catch (err) {
	console.error('Error configuring Firestore:', err);
}

// Development environment setup
if (!isProduction()) {
	console.info('Running on development mode');

	connectFirestoreEmulator(FireStore, '127.0.0.1', 8080);
	connectAuthEmulator(auth, 'http://localhost:9099');
	connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// Create a safer wrapper for Firebase operations
export const safeFirebaseOperation = async <T>(
	operation: () => Promise<T>,
	fallback: T | null = null,
	errorContext: string = 'Firebase operation'
): Promise<T | null> => {
	try {
		return await operation();
	} catch (error) {
		console.error(`Error in ${errorContext}:`, error);
		return fallback;
	}
};

export { auth, FireStore, storage, app, DB };
