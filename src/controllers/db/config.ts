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
	type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
// Removed import to avoid circular dependency - isProduction is inlined below
import firebaseConfig from './configKey';
import { initializeFirebaseAppCheck } from './appCheck';
import { logError } from '@/utils/errorHandling';
import {
	clearIndexedDBErrorRecord,
	recordIndexedDBError,
	setPersistentCacheEnabled,
	shouldSkipIndexedDB,
} from '@/utils/firestorePersistenceFallback';

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

function initializeWithMemoryCache(app: ReturnType<typeof initializeApp>): Firestore {
	setPersistentCacheEnabled(false);

	return initializeFirestore(app, {
		experimentalAutoDetectLongPolling: true,
		localCache: memoryLocalCache(),
	});
}

// Initialize Firestore with appropriate cache settings based on platform
function initializeFirestoreWithCache(app: ReturnType<typeof initializeApp>): Firestore {
	const isIOSDevice = isIOS();
	const isLocalDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

	// In local development, use memory cache to avoid stale data from emulator restarts
	if (isLocalDev) {
		console.info(
			'Localhost detected: Using memory-only cache for Firestore (fresh data on refresh)',
		);

		return initializeWithMemoryCache(app);
	}

	// iOS Safari has issues with IndexedDB, use memory-only cache
	if (isIOSDevice) {
		console.info('iOS detected: Using memory-only cache for Firestore');

		return initializeWithMemoryCache(app);
	}

	// Skip IndexedDB if a previous load hit an assertion/persistence error.
	// The Firestore internal-assertion bug is not self-healing, so retrying the
	// persistent cache just reproduces the crash for this user.
	if (shouldSkipIndexedDB()) {
		console.info('Previous IndexedDB errors detected: Using memory-only cache');

		return initializeWithMemoryCache(app);
	}

	// For other browsers, use multi-tab manager to allow multiple tabs
	// Single-tab manager causes "Failed to obtain exclusive access" errors
	try {
		const firestore = initializeFirestore(app, {
			experimentalAutoDetectLongPolling: true,
			localCache: persistentLocalCache({
				tabManager: persistentMultipleTabManager(),
			}),
		});
		setPersistentCacheEnabled(true);

		return firestore;
	} catch (error) {
		logError(error, {
			operation: 'config.initializeFirestoreDB',
			metadata: {
				message: 'Failed to initialize with persistent cache, falling back to memory cache',
			},
		});
		recordIndexedDBError();

		return initializeWithMemoryCache(app);
	}
}

/**
 * Clear Firestore IndexedDB persistence - call this when assertion errors occur
 * This should be called before re-initializing Firestore
 */
export async function clearFirestorePersistence(): Promise<void> {
	try {
		await clearIndexedDbPersistence(FireStore);
		clearIndexedDBErrorRecord();
		console.info('Firestore IndexedDB persistence cleared successfully');
	} catch (error) {
		logError(error, {
			operation: 'config.clearFirestorePersistence',
			metadata: { message: 'Failed to clear Firestore persistence:' },
		});
	}
}

/**
 * Handle Firestore assertion errors by recording them
 * This helps the app fall back to memory cache on next load
 */
export function handleFirestoreAssertionError(error: Error): void {
	if (error.message?.includes('INTERNAL ASSERTION FAILED')) {
		logError(new Error('Firestore assertion error detected, recording for memory cache fallback'), {
			operation: 'config.handleFirestoreAssertionError',
		});
		recordIndexedDBError();
	}
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Firebase app initialized

// Inline isProduction check - needed before App Check decision
const isProductionForAppCheck =
	typeof window !== 'undefined' && window.location.hostname !== 'localhost';

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
const isProduction =
	typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
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
					logError(error, {
						operation: 'config.unknown',
						metadata: { message: 'Failed to initialize Analytics:' },
					});
					// Analytics initialization failed, but app continues
				}
			} else {
				console.info(
					'Analytics not initialized: isSupported=',
					supported,
					'indexedDBAvailable=',
					indexedDBAvailable,
				);
			}
		})
		.catch((error) => {
			logError(error, {
				operation: 'config.unknown',
				metadata: { message: 'Analytics initialization check failed:' },
			});
			// Analytics not supported or error occurred
		});
}

setPersistence(auth, browserLocalPersistence)
	.then(() => {
		// Persistence set to local storage
	})
	.catch((error) => {
		logError(error, {
			operation: 'config.unknown',
			metadata: { message: 'Error setting persistence:' },
		});
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
		logError(error, {
			operation: 'config.unknown',
			metadata: { message: 'Failed to connect to Firestore emulator:' },
		});
	}

	try {
		connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
		console.info('Connected to Auth emulator on localhost:9099');
	} catch (error) {
		logError(error, {
			operation: 'config.unknown',
			metadata: { message: 'Failed to connect to Auth emulator:' },
		});
	}

	try {
		connectStorageEmulator(storage, 'localhost', 9199);
		console.info('Connected to Storage emulator on localhost:9199');
	} catch (error) {
		logError(error, {
			operation: 'config.unknown',
			metadata: { message: 'Failed to connect to Storage emulator:' },
		});
	}

	try {
		connectFunctionsEmulator(functions, 'localhost', 5001);
		console.info('Connected to Functions emulator on localhost:5001');
	} catch (error) {
		logError(error, {
			operation: 'config.unknown',
			metadata: { message: 'Failed to connect to Functions emulator:' },
		});
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
 * Get the join app base URL based on the environment.
 * The join app opens a specific question via its `/q/{statementId}` route.
 */
export function getJoinAppUrl(): string {
	if (!isProduction) {
		return 'http://localhost:3007';
	}

	// wizcol-join.web.app is the live hosting site; the join.wizcol.com custom
	// domain does not resolve. Override with VITE_JOIN_APP_URL if that changes.
	return import.meta.env.VITE_JOIN_APP_URL || 'https://wizcol-join.web.app';
}

/**
 * Get the results page URL for a specific statement in the mass-consensus app
 */
export function getMassConsensusResultsUrl(statementId: string): string {
	return `${getMassConsensusUrl()}/q/${statementId}/results`;
}

export { auth, FireStore, storage, app, DB, analytics, functions, appCheck };
