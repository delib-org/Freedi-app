import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Set emulator host BEFORE any Firebase initialization
// This allows Firebase Admin to automatically connect to the emulator
if (process.env.USE_FIREBASE_EMULATOR === 'true' && process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
}

let app: App;
let firestore: Firestore;

/**
 * Initialize Firebase Admin SDK
 * Only initializes once per server instance
 */
export function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    app = getApps()[0]!;
    
return app;
  }

  try {
    // Check if we have explicit credentials or should use default
    const hasExplicitCredentials =
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY;

    if (hasExplicitCredentials) {
      // Initialize with explicit service account credentials
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      console.info('[Firebase Admin] Initialized with explicit credentials');
    } else {
      // Use default credentials (works in Firebase Functions, Cloud Run, etc.)
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      console.info('[Firebase Admin] Initialized with default credentials');
    }

    return app;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error);
    throw error;
  }
}

/**
 * Get Firestore instance
 * Lazy initialization - emulator connection is automatic via FIRESTORE_EMULATOR_HOST env var
 */
export function getFirestoreAdmin(): Firestore {
  if (!firestore) {
    if (!app) {
      initializeFirebaseAdmin();
    }

    firestore = getFirestore(app);

    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulatorHost) {
      console.info('[Firebase Admin] Connected to Firestore emulator:', emulatorHost);
    } else {
      console.info('[Firebase Admin] Connected to production Firestore');
    }
  }
  
return firestore;
}

// Export singleton instance
export const admin = {
  firestore: getFirestoreAdmin,
  app: () => app || initializeFirebaseAdmin(),
};

export default admin;
