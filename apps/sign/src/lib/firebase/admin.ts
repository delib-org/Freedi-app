import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { logError } from '@/lib/utils/errorHandling';

// Set emulator host BEFORE any Firebase initialization
// This allows Firebase Admin to automatically connect to the emulator
if (process.env.USE_FIREBASE_EMULATOR === 'true' && process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
}

let app: App;
let firestore: Firestore;
let storage: Storage;

/**
 * Initialize Firebase Admin SDK
 * Only initializes once per server instance
 */
export function initializeFirebaseAdmin(): App {
  // Debug: Log credentials status on every call
  console.info('[Firebase Admin - Sign] Init called. Apps:', getApps().length,
    'CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
    'PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'SET (' + process.env.FIREBASE_PRIVATE_KEY.length + ' chars)' : 'NOT SET'
  );

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

    // Debug logging
    console.info('[Firebase Admin - Sign] Credentials check:', {
      hasExplicitCredentials: !!hasExplicitCredentials,
      hasServiceAccountFile: !!hasServiceAccountFile,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'set' : 'not set',
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'set (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'not set',
    });

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

      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket,
      });
      console.info('[Firebase Admin - Sign] Initialized with explicit credentials, bucket:', storageBucket);
    } else if (hasServiceAccountFile) {
      // Initialize with service account file (GOOGLE_APPLICATION_CREDENTIALS)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const serviceAccount = JSON.parse(fs.readFileSync(hasServiceAccountFile, 'utf8'));
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`;
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket,
      });
      console.info('[Firebase Admin - Sign] Initialized with service account file, bucket:', storageBucket);
    } else {
      // Use default credentials (works in Firebase Functions, Cloud Run, etc.)
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
      app = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket,
      });
      console.info('[Firebase Admin - Sign] Initialized with default credentials, bucket:', storageBucket);
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

/**
 * Get Firebase Storage instance
 */
export function getStorageAdmin(): Storage {
  if (!storage) {
    if (!app) {
      initializeFirebaseAdmin();
    }

    storage = getStorage(app);
  }

  return storage;
}

/**
 * Maximum image size in bytes (5 MB)
 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Download an image from a URL and upload it to Firebase Storage
 * @param sourceUrl - The URL to download the image from
 * @param storagePath - The path in Firebase Storage (e.g., 'documents/docId/images/imgId.jpg')
 * @returns The public download URL of the uploaded image
 */
export async function uploadImageFromUrl(
  sourceUrl: string,
  storagePath: string
): Promise<string> {
  try {
    // Fetch the image from the source URL
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // Get the image data as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check file size
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`);
    }

    // Get storage bucket
    const storageInstance = getStorageAdmin();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
    const bucket = storageInstance.bucket(bucketName);

    // Create a file reference and upload
    const file = bucket.file(storagePath);
    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    // Make the file public and get the download URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}`;

    return publicUrl;
  } catch (error) {
    logError(error, {
      operation: 'firebase.uploadImageFromUrl',
      metadata: { sourceUrl, storagePath },
    });
    throw error;
  }
}

/**
 * Upload a buffer directly to Firebase Storage
 * @param buffer - The file buffer to upload
 * @param storagePath - The path in Firebase Storage
 * @param contentType - The MIME type of the file
 * @returns The public download URL
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<string> {
  try {
    // Check file size
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`);
    }

    const storageInstance = getStorageAdmin();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;
    const bucket = storageInstance.bucket(bucketName);

    const file = bucket.file(storagePath);
    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000',
      },
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}`;

    return publicUrl;
  } catch (error) {
    logError(error, {
      operation: 'firebase.uploadBufferToStorage',
      metadata: { storagePath, contentType, size: buffer.length },
    });
    throw error;
  }
}

// Export singleton instance
export const admin = {
  firestore: getFirestoreAdmin,
  storage: getStorageAdmin,
  app: () => app || initializeFirebaseAdmin(),
};

export default admin;
