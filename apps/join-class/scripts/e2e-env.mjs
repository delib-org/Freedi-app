// Where the e2e scripts find the emulators and the app. One place, so CI's
// default ports and a developer's own ports both work:
//
//   JOIN_CLASS_URL        the running app          (default http://localhost:3035)
//   E2E_PROJECT_ID        Firebase project id      (default freedi-test)
//   E2E_AUTH_PORT         auth emulator port       (default: FIREBASE_AUTH_EMULATOR_HOST, else 9099)
//   E2E_FIRESTORE_PORT    firestore emulator port  (alias E2E_FS_PORT; default:
//                         FIRESTORE_EMULATOR_HOST, else 8081)
//   E2E_FUNCTIONS_PORT    functions emulator port  (default 5001; only scripts that call a callable directly)
//
// Importing this module also exports FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
// / GCLOUD_PROJECT into process.env, so firebase-admin and the tsx seed script
// (spawned with this environment) talk to the same emulators.

const portOf = (host, fallback) => host?.split(':').pop() || fallback;

export const BASE_URL = process.env.JOIN_CLASS_URL ?? 'http://localhost:3035';
export const PROJECT_ID = process.env.E2E_PROJECT_ID ?? 'freedi-test';
export const AUTH_PORT =
	process.env.E2E_AUTH_PORT ?? portOf(process.env.FIREBASE_AUTH_EMULATOR_HOST, '9099');
export const FIRESTORE_PORT =
	process.env.E2E_FIRESTORE_PORT ??
	process.env.E2E_FS_PORT ??
	portOf(process.env.FIRESTORE_EMULATOR_HOST, '8081');

export const FUNCTIONS_PORT = process.env.E2E_FUNCTIONS_PORT ?? '5001';

process.env.FIRESTORE_EMULATOR_HOST = `localhost:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `localhost:${AUTH_PORT}`;
process.env.GCLOUD_PROJECT = PROJECT_ID;
