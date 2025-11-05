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
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	memoryLocalCache,
	type Firestore
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
// Removed import to avoid circular dependency - isProduction is inlined below
import firebaseConfig from './configKey';

// Helper to detect iOS devices
function isIOS(): boolean {
	const userAgent = navigator.userAgent.toLowerCase();
	
return (
		/iphone|ipad|ipod/.test(userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

// Helper to check if IndexedDB is available and working
async function isIndexedDBAvailable(): Promise<boolean> {
	if (!('indexedDB' in window)) return false;

	try {
		const testDB = await new Promise<boolean>((resolve) => {
			const request = indexedDB.open('test-db', 1);
			request.onsuccess = () => {
				request.result.close();
				indexedDB.deleteDatabase('test-db');
				resolve(true);
			};
			request.onerror = () => resolve(false);
			request.onblocked = () => resolve(false);
		});
		
return testDB;
	} catch {
		return false;
	}
}

// Initialize Firestore with appropriate cache settings based on platform
function initializeFirestoreWithCache(app: ReturnType<typeof initializeApp>): Firestore {
	const isIOSDevice = isIOS();

	// iOS Safari has issues with IndexedDB, use memory-only cache
	if (isIOSDevice) {
		console.info('iOS detected: Using memory-only cache for Firestore');
		
return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}

	// For other browsers, attempt persistent cache with fallback
	try {
		return initializeFirestore(app, {
			localCache: persistentLocalCache({
				tabManager: persistentMultipleTabManager(),
			}),
		});
	} catch (error) {
		console.error(
			'Failed to initialize with persistent cache, falling back to memory cache:',
			error
		);
		
return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firebase app initialized

const FireStore = initializeFirestoreWithCache(app);
const DB = FireStore;
const storage = getStorage(app);
const auth = getAuth();
const functions = getFunctions(app);

// Initialize Analytics only in production and if supported
let analytics: ReturnType<typeof getAnalytics> | null = null;
// Inline isProduction check to avoid circular dependency
const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
	? false
	: typeof window !== 'undefined' && window.location.hostname !== 'localhost';

if (isProduction) {
	// Check both isSupported and IndexedDB availability before initializing analytics
	Promise.all([isSupported(), isIndexedDBAvailable()])
		.then(([supported, indexedDBAvailable]) => {
			if (supported && indexedDBAvailable) {
				try {
					analytics = getAnalytics(app);
				} catch (error) {
					console.error('Failed to initialize Analytics:', error);
					// Analytics initialization failed, but app continues
				}
			} else {
				console.info('Analytics not initialized: isSupported=', supported, 'indexedDBAvailable=', indexedDBAvailable);
			}
		})
		.catch((error) => {
			console.error('Analytics initialization check failed:', error);
			// Analytics not supported or error occurred
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
if (!isProduction) {
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

	try {
		connectFunctionsEmulator(functions, 'localhost', 5001);
		console.info('Connected to Functions emulator on localhost:5001');
	} catch (error) {
		console.error('Failed to connect to Functions emulator:', error);
	}
}

export { auth, FireStore, storage, app, DB, analytics, functions };
