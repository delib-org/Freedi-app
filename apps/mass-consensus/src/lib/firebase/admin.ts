import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

// Handle emulator configuration BEFORE any Firebase initialization
// Firebase Admin SDK automatically uses emulators if FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set
if (process.env.USE_FIREBASE_EMULATOR === 'true') {
  // Emulator enabled - keep the host settings
  console.info('[Firebase Admin] Emulator mode enabled');
  console.info('[Firebase Admin] Firestore emulator:', process.env.FIRESTORE_EMULATOR_HOST);
  console.info('[Firebase Admin] Auth emulator:', process.env.FIREBASE_AUTH_EMULATOR_HOST);
} else {
  // Emulator disabled - remove the env vars to force cloud connection
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  console.info('[Firebase Admin] Cloud mode enabled, connecting to production Firebase');
}

let app: App;
let firestore: Firestore;
let storage: Storage;

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

    const hasServiceAccountFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (hasExplicitCredentials) {
      // Initialize with explicit service account credentials
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.info('[Firebase Admin] Initialized with explicit credentials');
    } else if (hasServiceAccountFile) {
      // Initialize with service account file (GOOGLE_APPLICATION_CREDENTIALS)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const serviceAccount = JSON.parse(fs.readFileSync(hasServiceAccountFile, 'utf8'));
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.info('[Firebase Admin] Initialized with service account file');
    } else {
      // Use default credentials (works in Firebase Functions, Cloud Run, etc.)
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
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

/**
 * Get Storage instance
 * Lazy initialization - emulator connection is automatic via FIREBASE_STORAGE_EMULATOR_HOST env var
 */
export function getStorageAdmin(): Storage {
  if (!storage) {
    if (!app) {
      initializeFirebaseAdmin();
    }

    storage = getStorage(app);

    const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    if (emulatorHost) {
      console.info('[Firebase Admin] Connected to Storage emulator:', emulatorHost);
    } else {
      console.info('[Firebase Admin] Connected to production Storage');
    }
  }

return storage;
}

// Export singleton instance
export const admin = {
  firestore: getFirestoreAdmin,
  storage: getStorageAdmin,
  app: () => app || initializeFirebaseAdmin(),
};

export default admin;
