/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_FIREBASE_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENABLE_IN_LOCAL?: string;
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_EMULATOR_AUTH_PORT?: string;
  readonly VITE_EMULATOR_FIRESTORE_PORT?: string;
  readonly VITE_EMULATOR_FUNCTIONS_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
