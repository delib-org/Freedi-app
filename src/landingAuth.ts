import { getApp, getApps, initializeApp } from 'firebase/app';
import {
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	GoogleAuthProvider,
	setPersistence,
	signInAnonymously,
	signInWithPopup,
} from 'firebase/auth';
import firebaseConfig from '@/controllers/db/configKey';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
let configured = false;

function isLocalPreview(): boolean {
	return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

async function ready(): Promise<void> {
	if (!configured) {
		configured = true;
		const port = Number(import.meta.env.VITE_EMULATOR_AUTH_PORT || 9099);
		if (isLocalPreview() && Number.isFinite(port)) {
			try {
				connectAuthEmulator(auth, `http://localhost:${port}`, { disableWarnings: true });
			} catch {
				// The app shell shares this auth instance and may have connected it
				// already; a second call throws auth/emulator-config-failed and used
				// to block local sign-in from the landing page.
			}
			// Either call may have connected it. If neither did, stop: signing in
			// here would create a real account in the live project.
			if (!auth.emulatorConfig) {
				throw new Error(
					'Auth emulator not connected; refusing to sign in against the live project.',
				);
			}
		}
	}
	await setPersistence(auth, browserLocalPersistence);
}

function enterApp(): void {
	window.location.replace('/home');
}

export async function signInWithGoogle(): Promise<void> {
	await ready();
	await signInWithPopup(auth, new GoogleAuthProvider());
	enterApp();
}

export async function signInWithTemporaryName(name: string): Promise<void> {
	localStorage.setItem('displayName', name);
	await ready();
	await signInAnonymously(auth);
	enterApp();
}
