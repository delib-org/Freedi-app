import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  browserLocalPersistence,
  setPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { logError } from '../utils/errorHandling';

// Region for all Cloud Functions in this project. Matches functionConfig.region
// in @freedi/shared-types and the deploy targets (me-west1 / Tel Aviv).
const FUNCTIONS_REGION = 'me-west1';

// Firebase client configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase app (singleton pattern)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Get Auth instance
const auth = getAuth(app);

// Get Firestore instance for client-side operations
const db = getFirestore(app);

// Get Storage instance for client-side operations
const storage = getStorage(app);

// Get Functions instance pinned to the deploy region
const functions = getFunctions(app, FUNCTIONS_REGION);

// Connect to emulators in development
// Check if we're on localhost (development mode)
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

if (isLocalhost) {
  console.info('[Firebase Client] Development mode - connecting to emulators');

  // Connect to Auth emulator
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    console.info('[Firebase Client] Connected to Auth emulator on localhost:9099');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.connectAuthEmulator' });
  }

  // Connect to Firestore emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8081);
    console.info('[Firebase Client] Connected to Firestore emulator on localhost:8081');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.connectFirestoreEmulator' });
  }

  // Connect to Storage emulator
  try {
    connectStorageEmulator(storage, 'localhost', 9199);
    console.info('[Firebase Client] Connected to Storage emulator on localhost:9199');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.connectStorageEmulator' });
  }

  // Connect to Functions emulator
  try {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.info('[Firebase Client] Connected to Functions emulator on localhost:5001');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.connectFunctionsEmulator' });
  }
}

// Set persistence to local storage
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    logError(error, { operation: 'firebaseClient.setPersistence' });
  });
}

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.info('[Firebase] Sign in successful:', result.user.email);
    return result.user;
  } catch (error) {
    logError(error, { operation: 'firebaseClient.signInWithGoogle' });
    throw error;
  }
}

/**
 * Handle the redirect result after Google sign-in (legacy - now using popup)
 * Kept for backwards compatibility
 */
export async function handleRedirectResult(): Promise<{ user: User; token: string } | null> {
  // No longer using redirect flow - using popup instead
  return null;
}

/**
 * Sign out the current user
 */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
    clearTokenCache();
    // Clear the key older builds persisted, so a downgrade can't resurrect it.
    localStorage.removeItem('firebase_token');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.signOutUser' });
    throw error;
  }
}

/**
 * Token cache to prevent excessive refresh calls.
 * Firebase tokens are valid for ~1 hour; we cache for 5 minutes
 * to avoid hammering the securetoken API.
 */
let cachedToken: string | null = null;
let tokenExpiry = 0;
const TOKEN_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/** Drop the in-memory token so the next read goes back to the SDK. */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Get the current user's ID token.
 *
 * `user.getIdToken()` already refreshes on its own once the token is close to
 * expiring, so the only thing kept here is a short in-memory cache to avoid
 * hammering the securetoken API.
 *
 * There is deliberately no localStorage fallback. It used to return a token
 * written once at sign-in, which by the time anything fell back to it could be
 * hours old — the server then rejected it as auth/id-token-expired, and the
 * long-running synthesis poll failed exactly that way. A missing token is a
 * recoverable "send them to login"; a stale one is a silent 401.
 *
 * @param options.force - bypass every cache and mint a new token. Use after a
 *   401, where the assumption that the held token is still good was just
 *   disproved by the server.
 */
export async function getCurrentToken(
  options: { force?: boolean } = {}
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    clearTokenCache();
    return null;
  }

  if (!options.force && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const token = await user.getIdToken(options.force === true);
    cachedToken = token;
    tokenExpiry = Date.now() + TOKEN_CACHE_MS;
    return token;
  } catch (error) {
    logError(error, {
      operation: 'firebaseClient.getCurrentToken',
      metadata: { forced: options.force === true },
    });
    clearTokenCache();

    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export { auth, app, db, storage, functions };
export type { User };
