/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FIREBASE_API_KEY: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN: string;
	readonly VITE_FIREBASE_PROJECT_ID: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	readonly VITE_FIREBASE_APP_ID: string;
	readonly VITE_FIREBASE_MEASUREMENT_ID: string;
	/** Origin of the Odyssey app, so a civic square can offer the way back to the islands */
	readonly VITE_ODYSSEY_ORIGIN?: string;
	/** Origin of Studio, so the teacher menu can link to "My Agora classrooms" there */
	readonly VITE_STUDIO_ORIGIN?: string;
	/** Origin of the main WizCol app, where a linked station's question lives (default app.wizcol.com) */
	readonly VITE_MAIN_ORIGIN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
