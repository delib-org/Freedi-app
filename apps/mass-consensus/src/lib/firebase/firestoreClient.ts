/**
 * Browser Firestore instance. Kept out of client.ts so pages that never read
 * Firestore directly do not download it; prefer loadFirestore() on paths that
 * matter for first load.
 */
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { app } from './client';
import { CLIENT_EMULATORS, isClientEmulatorMode } from './clientEmulators';
import { logError } from '../utils/errorHandling';

const db = getFirestore(app);

if (isClientEmulatorMode()) {
  try {
    connectFirestoreEmulator(db, CLIENT_EMULATORS.host, CLIENT_EMULATORS.firestorePort);
  } catch (error) {
    logError(error, { operation: 'firestoreClient.connectFirestoreEmulator' });
  }
}

export { db };
