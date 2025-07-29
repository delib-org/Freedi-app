// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import {
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	setPersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { isProduction } from '../general/helpers';
import firebaseConfig from './configKey';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firebase app initialized

const FireStore = getFirestore(app);
const DB = FireStore;
const storage = getStorage(app);
const auth = getAuth();

// Initialize Analytics only in production and if supported
let analytics: ReturnType<typeof getAnalytics> | null = null;
if (isProduction()) {
	isSupported().then((supported) => {
		if (supported) {
			analytics = getAnalytics(app);
		}
	}).catch(() => {
		// Analytics not supported
	});
}

setPersistence(auth, browserLocalPersistence)
	.then(() => {
		// Persistence set to local storage
	})
	.catch((error) => {
		console.error('Error setting persistence:', error);
	});

//development
if (!isProduction()) {
	console.info('Running on development mode');

	connectFirestoreEmulator(FireStore, '127.0.0.1', 8080);
	connectAuthEmulator(auth, 'http://localhost:9099');
	connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export { auth, FireStore, storage, app, DB, analytics };
