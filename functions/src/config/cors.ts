/**
 * Centralized CORS configuration for Firebase Functions
 * Update this list when adding new authorized domains
 */
export const ALLOWED_ORIGINS = [
	// Production — main app
	'https://app.wizcol.com',
	'https://wizcol-app.web.app',
	'https://wizcol-app.firebaseapp.com',
	// Production — per-app hosting targets (see .firebaserc)
	'https://wizcol-join.web.app',
	'https://wizcol-join.firebaseapp.com',
	'https://sign-wizcol.web.app',
	'https://sign-wizcol.firebaseapp.com',
	'https://wizcol-flow.web.app',
	'https://wizcol-flow.firebaseapp.com',
	'https://wizcol-admin.web.app',
	'https://wizcol-admin.firebaseapp.com',
	// Development/Testing
	'https://freedi-app-dev.web.app',
	'https://freedi-app-dev.firebaseapp.com',
	'https://freedi-test.web.app',
	'https://freedi-test.firebaseapp.com',
	// Local development — main app + per-app dev ports (see each apps/*/vite.config.ts)
	'http://localhost:5173', // main app
	'http://localhost:5174',
	'http://localhost:5175',
	'http://localhost:5176',
	'http://localhost:3000',
	'http://localhost:3001', // mass-consensus
	'http://localhost:3002', // sign
	'http://localhost:3003',
	'http://localhost:3004',
	'http://localhost:3005',
	'http://localhost:3006',
	'http://localhost:3007', // join
] as const;

export type AllowedOrigin = (typeof ALLOWED_ORIGINS)[number];
