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
  connectAuthEmulator,
  User,
  Auth,
} from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  FirebaseStorage,
  connectStorageEmulator,
} from 'firebase/storage';
import {
  getDatabase,
  connectDatabaseEmulator,
  Database,
} from 'firebase/database';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';
import {
  getAnalytics,
  isSupported,
  Analytics,
} from 'firebase/analytics';
import { logError } from '@/lib/utils/errorHandling';

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
let storage: FirebaseStorage;
let database: Database;
let firestore: Firestore;
let analytics: Analytics | null = null;
let authEmulatorConnected = false;
let storageEmulatorConnected = false;
let databaseEmulatorConnected = false;
let firestoreEmulatorConnected = false;

/**
 * Initialize Firebase client SDK
 */
export function initializeFirebaseClient(): FirebaseApp {
  if (getApps().length > 0) {
    app = getApps()[0]!;

    return app;
  }

  app = initializeApp(firebaseConfig);

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

    // Connect to auth emulator in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !authEmulatorConnected) {
      try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        authEmulatorConnected = true;
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return auth;
}

/**
 * Get Firestore instance for real-time listeners on the client
 * @deprecated Use getFirebaseFirestore() instead for consistency
 */
export function getFirestoreClient(): Firestore {
  return getFirebaseFirestore();
}

/**
 * Get Firebase Firestore instance
 */
export function getFirebaseFirestore(): Firestore {
  if (!firestore) {
    if (!app) {
      initializeFirebaseClient();
    }
    firestore = getFirestore(app);

    // Connect to Firestore emulator in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !firestoreEmulatorConnected) {
      try {
        connectFirestoreEmulator(firestore, 'localhost', 8081);
        firestoreEmulatorConnected = true;
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return firestore;
}

/**
 * Sign in with Google
 */
export async function googleLogin(): Promise<User | null> {
  try {
    const authInstance = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(authInstance, provider);

    // Set cookie for server-side access
    setCookiesFromUser(result.user);

    // Auto-accept any pending invitations for this user's email
    // Use sendBeacon to survive page navigation/refresh after login
    if (result.user.email) {
      triggerAutoAcceptInvitations();
    }

    return result.user;
  } catch (error) {
    logError(error, { operation: 'auth.googleLogin' });
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

    // Set cookie for server-side access
    setCookiesFromUser(result.user);

    return result.user;
  } catch (error) {
    logError(error, { operation: 'auth.anonymousLogin' });
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
    document.cookie = 'userEmail=; path=/; max-age=0';
  } catch (error) {
    logError(error, { operation: 'auth.logout' });
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

      // Auto-accept pending invitations when user has email (Google login)
      // Use sendBeacon to survive page navigation/refresh
      if (user.email) {
        triggerAutoAcceptInvitations();
      }
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

  if (user.email) {
    document.cookie = `userEmail=${encodeURIComponent(user.email)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  const authInstance = getFirebaseAuth();

  return authInstance.currentUser;
}

/**
 * Trigger auto-accept using sendBeacon (fire-and-forget)
 * This survives page navigation/refresh after login
 */
function triggerAutoAcceptInvitations(): void {
  try {
    // sendBeacon survives page unload/navigation
    const success = navigator.sendBeacon('/api/auth/accept-pending-invitations');
    if (!success) {
      // Fallback to fetch if sendBeacon fails
      acceptPendingInvitations().catch((error) => {
        logError(error, { operation: 'auth.triggerAutoAcceptInvitations.fallback' });
      });
    }
  } catch {
    // Fallback to fetch if sendBeacon throws
    acceptPendingInvitations().catch((err) => {
      logError(err, { operation: 'auth.triggerAutoAcceptInvitations.fallback' });
    });
  }
}

/**
 * Auto-accept pending invitations for the current user's email
 * Called automatically after Google login
 */
export async function acceptPendingInvitations(): Promise<{
  acceptedCount: number;
  acceptedInvitations: Array<{ documentId: string; permissionLevel: string }>;
}> {
  try {
    const response = await fetch('/api/auth/accept-pending-invitations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to accept invitations: ${response.status}`);
    }

    const data = await response.json();

    return {
      acceptedCount: data.acceptedCount || 0,
      acceptedInvitations: data.acceptedInvitations || [],
    };
  } catch (error) {
    logError(error, { operation: 'auth.acceptPendingInvitations' });
    throw error;
  }
}

/**
 * Get Firebase Storage instance
 */
export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    if (!app) {
      initializeFirebaseClient();
    }
    storage = getStorage(app);

    // Connect to storage emulator in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !storageEmulatorConnected) {
      try {
        connectStorageEmulator(storage, 'localhost', 9199);
        storageEmulatorConnected = true;
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return storage;
}

/**
 * Get Firebase Realtime Database instance
 */
export function getFirebaseRealtimeDatabase(): Database {
  if (!database) {
    if (!app) {
      initializeFirebaseClient();
    }
    database = getDatabase(app);

    // Connect to database emulator in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !databaseEmulatorConnected) {
      try {
        connectDatabaseEmulator(database, 'localhost', 9000);
        databaseEmulatorConnected = true;
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return database;
}

/**
 * Get Firebase Analytics instance
 * Analytics only works in browser environment
 */
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analytics) {
    return analytics;
  }

  // Analytics only works in browser
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      return null;
    }

    if (!app) {
      initializeFirebaseClient();
    }

    analytics = getAnalytics(app);

    return analytics;
  } catch (error) {
    logError(error, { operation: 'analytics.getFirebaseAnalytics' });

    return null;
  }
}

/**
 * Get analytics instance synchronously (may be null if not initialized)
 */
export function getAnalyticsInstance(): Analytics | null {
  return analytics;
}

/**
 * Upload a file to Firebase Storage
 * @param file - The file to upload
 * @param path - The storage path (e.g., 'logos/document-id/logo.png')
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns The download URL of the uploaded file
 */
export async function uploadFile(
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const storageInstance = getFirebaseStorage();
  const storageRef = ref(storageInstance, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => {
        logError(error, { operation: 'storage.uploadFile', metadata: { path } });
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (error) {
          logError(error, { operation: 'storage.uploadFile.getDownloadURL', metadata: { path } });
          reject(error);
        }
      }
    );
  });
}
