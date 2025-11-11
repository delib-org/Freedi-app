import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

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
    // Initialize with service account credentials
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

    console.info('[Firebase Admin] Initialized successfully');
    return app;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error);
    throw error;
  }
}

/**
 * Get Firestore instance
 * Lazy initialization
 */
export function getFirestoreAdmin(): Firestore {
  if (!firestore) {
    if (!app) {
      initializeFirebaseAdmin();
    }
    firestore = getFirestore(app);
  }
  return firestore;
}

// Export singleton instance
export const admin = {
  firestore: getFirestoreAdmin,
  app: () => app || initializeFirebaseAdmin(),
};

export default admin;
