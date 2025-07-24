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
import { isProduction } from '../general/helpers';
import firebaseConfig from './configKey';
import { environment } from '../../config/environment';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const FireStore = getFirestore(app);
const DB = FireStore;
const storage = getStorage(app);
const auth = getAuth();

setPersistence(auth, browserLocalPersistence)
	.then(() => {
		console.info('Persistence set to local storage (cross-site safe).');
	})
	.catch((error) => {
		console.error('Error setting persistence:', error);
	});

//development
if (!isProduction()) {
	console.info('Running on development mode');
	
	// Connect to Firestore and Storage emulators
	connectFirestoreEmulator(FireStore, environment.emulators.firestore, 8080);
	connectStorageEmulator(storage, environment.emulators.storage, 9199);
	
	// Only connect auth emulator if not using production auth
	// (Google OAuth doesn't work well with auth emulator on mobile)
	if (!environment.useProductionAuth) {
		connectAuthEmulator(auth, `http://${environment.emulators.auth}:9099`);
		console.info('Using Auth emulator');
	} else {
		console.info('Using production Auth for mobile development (OAuth compatibility)');
	}
}

export { auth, FireStore, storage, app, DB };
