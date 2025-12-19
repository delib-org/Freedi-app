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
    console.error('[Firebase Client] Auth emulator connection error:', error);
  }

  // Connect to Firestore emulator
  try {
    connectFirestoreEmulator(db, 'localhost', 8081);
    console.info('[Firebase Client] Connected to Firestore emulator on localhost:8081');
  } catch (error) {
    console.error('[Firebase Client] Firestore emulator connection error:', error);
  }
}

// Set persistence to local storage
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Error setting auth persistence:', error);
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
    console.error('[Firebase] Google sign-in error:', error);
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
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Get current user's ID token (refreshes if needed)
 */
export async function getCurrentToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const token = await user.getIdToken(true);
    localStorage.setItem('firebase_token', token);
    return token;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export { auth, app, db };
export type { User };
