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
import { logError } from '../utils/errorHandling';

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
    const token = await result.user.getIdToken();
    localStorage.setItem('firebase_token', token);
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

/**
 * Get current user's ID token.
 * Uses in-memory cache to avoid excessive API calls.
 * Falls back to localStorage token on error (e.g. quota exceeded).
 */
export async function getCurrentToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    // Don't force refresh — Firebase SDK uses cached token if still valid
    const token = await user.getIdToken();
    cachedToken = token;
    tokenExpiry = Date.now() + TOKEN_CACHE_MS;
    localStorage.setItem('firebase_token', token);
    return token;
  } catch (error) {
    logError(error, { operation: 'firebaseClient.getCurrentToken' });

    // Fallback to localStorage cached token (may still be valid)
    const fallbackToken = localStorage.getItem('firebase_token');
    if (fallbackToken) {
      return fallbackToken;
    }

    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export { auth, app, db, storage };
export type { User };
