/**
 * Firebase Client SDK for Sign app
 * Used for authentication on the client side
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';

// Firebase config - should match main app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let auth: Auth;

/**
 * Initialize Firebase client SDK
 */
export function initializeFirebaseClient(): FirebaseApp {
  if (getApps().length > 0) {
    app = getApps()[0]!;

    return app;
  }

  app = initializeApp(firebaseConfig);
  console.info('[Firebase Client - Sign] Initialized');

  return app;
}

/**
 * Get Firebase Auth instance
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    if (!app) {
      initializeFirebaseClient();
    }
    auth = getAuth(app);
  }

  return auth;
}

/**
 * Sign in with Google
 */
export async function googleLogin(): Promise<User | null> {
  try {
    const authInstance = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(authInstance, provider);

    console.info('[Firebase Auth] User signed in with Google', { userId: result.user.uid });

    // Set cookie for server-side access
    setCookiesFromUser(result.user);

    return result.user;
  } catch (error) {
    console.error('[Firebase Auth] Google login failed', error);
    throw error;
  }
}

/**
 * Sign in anonymously
 */
export async function anonymousLogin(): Promise<User | null> {
  try {
    const authInstance = getFirebaseAuth();
    const result = await signInAnonymously(authInstance);

    console.info('[Firebase Auth] User signed in anonymously', { userId: result.user.uid });

    // Set cookie for server-side access
    setCookiesFromUser(result.user);

    return result.user;
  } catch (error) {
    console.error('[Firebase Auth] Anonymous login failed', error);
    throw error;
  }
}

/**
 * Sign out
 */
export async function logout(): Promise<void> {
  try {
    const authInstance = getFirebaseAuth();
    await authInstance.signOut();

    // Clear cookies
    document.cookie = 'userId=; path=/; max-age=0';
    document.cookie = 'userDisplayName=; path=/; max-age=0';

    console.info('[Firebase Auth] User logged out');
  } catch (error) {
    console.error('[Firebase Auth] Logout failed', error);
    throw error;
  }
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  const authInstance = getFirebaseAuth();

  return onAuthStateChanged(authInstance, (user) => {
    if (user) {
      setCookiesFromUser(user);
    }
    callback(user);
  });
}

/**
 * Set cookies from Firebase user for server-side access
 */
function setCookiesFromUser(user: User): void {
  const maxAge = 60 * 60 * 24 * 30; // 30 days

  document.cookie = `userId=${user.uid}; path=/; max-age=${maxAge}; SameSite=Lax`;

  if (user.displayName) {
    document.cookie = `userDisplayName=${encodeURIComponent(user.displayName)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  const authInstance = getFirebaseAuth();

  return authInstance.currentUser;
}
