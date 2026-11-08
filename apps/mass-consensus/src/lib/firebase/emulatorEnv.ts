/**
 * Which Firebase backends the Admin SDK talks to, decided from the environment
 * BEFORE any Firebase initialisation. The Admin SDK picks up an emulator purely
 * from its host variable being set, one variable per product.
 */

/** Storage emulator host in `firebase.json`, used when emulator mode is on and none is given. */
export const DEFAULT_STORAGE_EMULATOR_HOST = 'localhost:9199';

const EMULATOR_HOST_VARS = [
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
] as const;

/**
 * Emulator mode keeps the host settings; cloud mode removes them so nothing
 * can leak a request to a local port. Returns whether emulator mode is on.
 *
 * Storage needs a default: the generated env files carry a host for Firestore
 * and Auth only. Left unset, Storage alone would talk to the real bucket while
 * everything else used the emulator — uploads then fail on cloud credentials
 * (or, with working credentials, land test files in the cloud).
 */
export function configureEmulatorEnv(env: NodeJS.ProcessEnv): boolean {
  if (env.USE_FIREBASE_EMULATOR !== 'true') {
    for (const name of EMULATOR_HOST_VARS) {
      delete env[name];
    }

    return false;
  }

  if (!env.FIREBASE_STORAGE_EMULATOR_HOST) {
    env.FIREBASE_STORAGE_EMULATOR_HOST = DEFAULT_STORAGE_EMULATOR_HOST;
  }

  return true;
}
