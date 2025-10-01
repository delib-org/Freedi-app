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

	try {
		// Check if emulators are already connected to avoid duplicate connections
		// @ts-ignore - accessing private property for debugging
		if (!FireStore._settings?.host?.includes('localhost')) {
			connectFirestoreEmulator(FireStore, 'localhost', 8080);
			console.info('Connected to Firestore emulator on localhost:8080');
		}
	} catch (error) {
		console.error('Failed to connect to Firestore emulator:', error);
	}

	try {
		connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
		console.info('Connected to Auth emulator on localhost:9099');
	} catch (error) {
		console.error('Failed to connect to Auth emulator:', error);
	}

	try {
		connectStorageEmulator(storage, 'localhost', 9199);
		console.info('Connected to Storage emulator on localhost:9199');
	} catch (error) {
		console.error('Failed to connect to Storage emulator:', error);
	}
}

export { auth, FireStore, storage, app, DB, analytics };
