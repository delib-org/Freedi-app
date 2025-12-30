import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logError } from '@/lib/utils/errorHandling';

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

    const hasServiceAccountFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (hasExplicitCredentials) {
      // Initialize with explicit service account credentials
      // Handle various newline formats from environment variables
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

      // Replace escaped newlines with actual newlines
      // This handles both \\n (double escaped) and \n (single escaped from JSON)
      privateKey = privateKey.replace(/\\n/g, '\n');

      // If the key still doesn't have actual newlines, try to fix common issues
      if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN')) {
        // The key might have been URL encoded or have other escape issues
        privateKey = privateKey.replace(/\\\\n/g, '\n');
      }

      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      console.info('[Firebase Admin - Sign] Initialized with explicit credentials');
    } else if (hasServiceAccountFile) {
      // Initialize with service account file (GOOGLE_APPLICATION_CREDENTIALS)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const serviceAccount = JSON.parse(fs.readFileSync(hasServiceAccountFile, 'utf8'));
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
      console.info('[Firebase Admin - Sign] Initialized with service account file');
    } else {
      // Use default credentials (works in Firebase Functions, Cloud Run, etc.)
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      console.info('[Firebase Admin - Sign] Initialized with default credentials');
    }

    return app;
  } catch (error) {
    logError(error, { operation: 'firebase.initializeFirebaseAdmin' });
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
      console.info('[Firebase Admin - Sign] Connected to Firestore emulator:', emulatorHost);
    } else {
      console.info('[Firebase Admin - Sign] Connected to production Firestore');
    }
  }

  return firestore;
}

/**
 * Get Firebase Admin with db access
 * Convenience function for API routes
 */
export function getFirebaseAdmin(): { db: Firestore; app: App } {
  if (!app) {
    initializeFirebaseAdmin();
  }

  return {
    db: getFirestoreAdmin(),
    app,
  };
}

// Export singleton instance
export const admin = {
  firestore: getFirestoreAdmin,
  app: () => app || initializeFirebaseAdmin(),
};

export default admin;
