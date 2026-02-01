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
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';
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
let firestore: Firestore;
let authEmulatorConnected = false;
let storageEmulatorConnected = false;
let firestoreEmulatorConnected = false;

/**
 * Initialize Firebase client SDK
 */
export function initializeFirebaseClient(): FirebaseApp {
  if (getApps().length > 0) {
    app = getApps()[0]!;

    return app;
  }

  // Debug: Check if env vars are loaded (don't log actual values for security)
  console.info('[Firebase Client - Sign] Config check:', {
    hasApiKey: !!firebaseConfig.apiKey,
    hasAuthDomain: !!firebaseConfig.authDomain,
    hasProjectId: !!firebaseConfig.projectId,
    projectId: firebaseConfig.projectId, // Safe to log project ID
  });

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

    // Connect to auth emulator in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !authEmulatorConnected) {
      try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        authEmulatorConnected = true;
        console.info('[Firebase Client - Sign] Connected to Auth emulator');
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return auth;
}

/**
 * Get Firestore instance for real-time listeners on the client
 */
export function getFirestoreClient(): Firestore {
  if (!firestore) {
    if (!app) {
      initializeFirebaseClient();
    }
    firestore = getFirestore(app);

    // Connect to Firestore emulator in development mode
    // Uses the same pattern as Auth emulator connection
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && !firestoreEmulatorConnected) {
      try {
        // Default to localhost:8081 which matches firebase.json config
        connectFirestoreEmulator(firestore, 'localhost', 8081);
        firestoreEmulatorConnected = true;
        console.info('[Firebase Client - Sign] Connected to Firestore emulator at localhost:8081');
      } catch (err) {
        console.error('[Firebase Client - Sign] Failed to connect to Firestore emulator:', err);
        // Continue without emulator - will use production
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

    console.info('[Firebase Auth] User signed in with Google', { userId: result.user.uid });

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

    console.info('[Firebase Auth] User signed in anonymously', { userId: result.user.uid });

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

    console.info('[Firebase Auth] User logged out');
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

  // DEBUG: Log what Firebase returns for the user
  console.info('[DEBUG] setCookiesFromUser - Firebase user data:', {
    uid: user.uid,
    email: user.email,
    emailLower: user.email?.toLowerCase(),
    displayName: user.displayName,
    providerId: user.providerId,
    providerData: user.providerData?.map(p => ({ providerId: p.providerId, email: p.email })),
  });

  document.cookie = `userId=${user.uid}; path=/; max-age=${maxAge}; SameSite=Lax`;

  if (user.displayName) {
    document.cookie = `userDisplayName=${encodeURIComponent(user.displayName)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }

  if (user.email) {
    console.info('[DEBUG] setCookiesFromUser - Setting email cookie:', {
      originalEmail: user.email,
      encodedEmail: encodeURIComponent(user.email),
    });
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
    if (success) {
      console.info('[Firebase Auth] Triggered auto-accept invitations via sendBeacon');
    } else {
      // Fallback to fetch if sendBeacon fails
      console.info('[Firebase Auth] sendBeacon failed, falling back to fetch');
      acceptPendingInvitations().catch((error) => {
        logError(error, { operation: 'auth.triggerAutoAcceptInvitations.fallback' });
      });
    }
  } catch {
    // Fallback to fetch if sendBeacon throws
    console.info('[Firebase Auth] sendBeacon not available, falling back to fetch');
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

    if (data.acceptedCount > 0) {
      console.info('[Firebase Auth] Auto-accepted invitations', {
        count: data.acceptedCount,
        documents: data.acceptedInvitations?.map((inv: { documentId: string }) => inv.documentId),
      });
    }

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
        console.info('[Firebase Client - Sign] Connected to Storage emulator');
      } catch {
        // Already connected or emulator not available
      }
    }
  }

  return storage;
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
          console.info('[Firebase Storage] Upload complete', { path });
          resolve(downloadURL);
        } catch (error) {
          logError(error, { operation: 'storage.uploadFile.getDownloadURL', metadata: { path } });
          reject(error);
        }
      }
    );
  });
}
