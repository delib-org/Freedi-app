/**
 * Server-only Firebase Admin SDK. Used for SSR reads (admin bypasses security
 * rules — visibility is enforced in code, see `server/conversation.ts`) and for
 * verifying session cookies. Never imported by client code.
 *
 * In production on Cloud Functions, credentials are auto-detected. In dev it
 * targets the local emulators: the standard `FIRESTORE_EMULATOR_HOST` /
 * `FIREBASE_AUTH_EMULATOR_HOST` env vars are defaulted below, so `vite dev`
 * works no matter how it was launched. The client (firebaseClient.ts) connects
 * to the same emulators on localhost — without this, /api/session 401s because
 * emulator-signed ID tokens can't be verified against production Google certs.
 */
import { initializeApp, getApps, getApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (dev) {
	// 127.0.0.1 (not localhost): the emulators listen on IPv4 only.
	process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';
	process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}

function ensureApp() {
	if (getApps().length) return getApp();

	const projectId =
		env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || env.VITE_FIREBASE_PROJECT_ID;

	// Service-account JSON (optional, for non-GCP hosts). On Cloud Functions and
	// with emulators, ADC / projectId is enough.
	const saJson = env.FIREBASE_SERVICE_ACCOUNT;
	if (saJson) {
		return initializeApp({ credential: cert(JSON.parse(saJson)), projectId });
	}

	try {
		return initializeApp({ credential: applicationDefault(), projectId });
	} catch {
		// Emulator / dev: no credentials needed.
		return initializeApp({ projectId });
	}
}

const app = ensureApp();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
