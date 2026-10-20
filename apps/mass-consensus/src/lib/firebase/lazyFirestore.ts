/**
 * Loads the Firestore SDK and the app's Firestore instance on first use.
 *
 * Student pages read Firestore only after a user action or behind a rarely-on
 * setting, so a static import would put ~110KB gzipped on their first load for
 * nothing. Both imports are cached by the bundler after the first call.
 */
import type { Firestore } from 'firebase/firestore';

export type FirestoreSdk = typeof import('firebase/firestore');

export interface LoadedFirestore {
  sdk: FirestoreSdk;
  db: Firestore;
}

export async function loadFirestore(): Promise<LoadedFirestore> {
  const [sdk, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('./firestoreClient'),
  ]);

  return { sdk, db };
}
