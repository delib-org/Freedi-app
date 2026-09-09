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

async function ready(): Promise<void> {
	if (!configured) {
		configured = true;
		const port = Number(import.meta.env.VITE_EMULATOR_AUTH_PORT || 9099);
		if (import.meta.env.DEV && Number.isFinite(port)) {
			connectAuthEmulator(auth, `http://localhost:${port}`, { disableWarnings: true });
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
