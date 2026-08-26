/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FIREBASE_API_KEY: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN: string;
	readonly VITE_FIREBASE_PROJECT_ID: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	readonly VITE_FIREBASE_APP_ID: string;
	readonly VITE_MAIN_APP_URL: string;
	readonly VITE_MASS_CONSENSUS_URL: string;
	readonly VITE_SIGN_APP_URL: string;
	readonly VITE_JOIN_APP_URL: string;
	readonly VITE_USE_EMULATORS: string;
	readonly VITE_EMULATOR_AUTH_PORT?: string;
	readonly VITE_EMULATOR_FIRESTORE_PORT?: string;
	readonly VITE_EMULATOR_FUNCTIONS_PORT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module '*.module.scss' {
	const classes: { readonly [key: string]: string };
	export default classes;
}
