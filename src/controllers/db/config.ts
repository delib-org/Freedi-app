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
	clearIndexedDbPersistence,
	type Firestore
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
// Removed import to avoid circular dependency - isProduction is inlined below
import firebaseConfig from './configKey';
import { initializeFirebaseAppCheck } from './appCheck';

// Storage key to track if we've had IndexedDB issues
const INDEXEDDB_ERROR_KEY = 'freedi_indexeddb_error';

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

// Check if we should skip IndexedDB due to previous errors
function shouldSkipIndexedDB(): boolean {
	try {
		const errorData = localStorage.getItem(INDEXEDDB_ERROR_KEY);
		if (errorData) {
			const { timestamp, count } = JSON.parse(errorData);
			const hoursSinceError = (Date.now() - timestamp) / (1000 * 60 * 60);
			// Reset after 24 hours to allow retry
			if (hoursSinceError > 24) {
				localStorage.removeItem(INDEXEDDB_ERROR_KEY);
				
return false;
			}
			// Skip IndexedDB if we've had multiple errors recently

			return count >= 2;
		}
	} catch {
		// Ignore localStorage errors
	}
	
return false;
}

// Record an IndexedDB error for future reference
function recordIndexedDBError(): void {
	try {
		const existing = localStorage.getItem(INDEXEDDB_ERROR_KEY);
		const data = existing ? JSON.parse(existing) : { count: 0 };
		data.timestamp = Date.now();
		data.count = (data.count || 0) + 1;
		localStorage.setItem(INDEXEDDB_ERROR_KEY, JSON.stringify(data));
	} catch {
		// Ignore localStorage errors
	}
}

// Initialize Firestore with appropriate cache settings based on platform
function initializeFirestoreWithCache(app: ReturnType<typeof initializeApp>): Firestore {
	const isIOSDevice = isIOS();
	const isLocalDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

	// In local development, use memory cache to avoid stale data from emulator restarts
	if (isLocalDev) {
		console.info('Localhost detected: Using memory-only cache for Firestore (fresh data on refresh)');

		return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}

	// iOS Safari has issues with IndexedDB, use memory-only cache
	if (isIOSDevice) {
		console.info('iOS detected: Using memory-only cache for Firestore');

		return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}

	// Skip IndexedDB if we've had repeated assertion errors
	if (shouldSkipIndexedDB()) {
		console.info('Previous IndexedDB errors detected: Using memory-only cache');

return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}

	// For other browsers, use multi-tab manager to allow multiple tabs
	// Single-tab manager causes "Failed to obtain exclusive access" errors
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
		recordIndexedDBError();
		
return initializeFirestore(app, {
			localCache: memoryLocalCache(),
		});
	}
}

/**
 * Clear Firestore IndexedDB persistence - call this when assertion errors occur
 * This should be called before re-initializing Firestore
 */
export async function clearFirestorePersistence(): Promise<void> {
	try {
		await clearIndexedDbPersistence(FireStore);
		localStorage.removeItem(INDEXEDDB_ERROR_KEY);
		console.info('Firestore IndexedDB persistence cleared successfully');
	} catch (error) {
		console.error('Failed to clear Firestore persistence:', error);
	}
}

/**
 * Handle Firestore assertion errors by recording them
 * This helps the app fall back to memory cache on next load
 */
export function handleFirestoreAssertionError(error: Error): void {
	if (error.message?.includes('INTERNAL ASSERTION FAILED')) {
		console.error('Firestore assertion error detected, recording for memory cache fallback');
		recordIndexedDBError();
	}
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firebase app initialized

// Inline isProduction check - needed before App Check decision
const isProductionForAppCheck = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

// Initialize App Check ONLY in production
// In development/emulator, App Check debug token exchange fails with Google servers
// causing CORS errors on callable functions
const appCheck = isProductionForAppCheck ? initializeFirebaseAppCheck(app) : null;

const FireStore = initializeFirestoreWithCache(app);
const DB = FireStore;
const storage = getStorage(app);
const auth = getAuth();
const functions = getFunctions(app, 'me-west1');

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
			connectFirestoreEmulator(FireStore, 'localhost', 8081);
			console.info('Connected to Firestore emulator on localhost:8081');
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

/**
 * Get the Firebase Functions URL based on the environment
 * Returns the appropriate base URL for calling HTTP Firebase Functions
 */
export function getFunctionsUrl(): string {
	const projectId = firebaseConfig.projectId || 'delib-5';
	// Most functions use me-west1 region as defined in functionConfig from delib-npm
	const region = 'me-west1';

	if (!isProduction) {
		return `http://localhost:5001/${projectId}/${region}`;
	}

	return `https://${region}-${projectId}.cloudfunctions.net`;
}

/**
 * Get the Mass Consensus app base URL based on the environment
 * Returns the appropriate base URL for the mass-consensus Next.js app
 */
export function getMassConsensusUrl(): string {
	if (!isProduction) {
		return 'http://localhost:3001';
	}

	// Production URL for the mass-consensus app
	return 'https://mc.wizcol.com';
}

/**
 * Get the question page URL for a specific statement in the mass-consensus app
 */
export function getMassConsensusQuestionUrl(statementId: string): string {
	return `${getMassConsensusUrl()}/q/${statementId}`;
}

/**
 * Get the results page URL for a specific statement in the mass-consensus app
 */
export function getMassConsensusResultsUrl(statementId: string): string {
	return `${getMassConsensusUrl()}/q/${statementId}/results`;
}

export { auth, FireStore, storage, app, DB, analytics, functions, appCheck };
