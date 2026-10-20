/** Browser Storage instance (admin uploads only). */
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { app } from './client';
import { CLIENT_EMULATORS, isClientEmulatorMode } from './clientEmulators';
import { logError } from '../utils/errorHandling';

const storage = getStorage(app);

if (isClientEmulatorMode()) {
  try {
    connectStorageEmulator(storage, CLIENT_EMULATORS.host, CLIENT_EMULATORS.storagePort);
  } catch (error) {
    logError(error, { operation: 'storageClient.connectStorageEmulator' });
  }
}

export { storage };
