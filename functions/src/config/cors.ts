/**
 * Centralized CORS configuration for Firebase Functions
 * Update this list when adding new authorized domains
 */
export const ALLOWED_ORIGINS = [
	// Production
	'https://app.wizcol.com',
	'https://wizcol-app.web.app',
	// Development/Testing
	'https://freedi-app-dev.web.app',
	'https://freedi-app-dev.firebaseapp.com',
	'https://freedi-test.web.app',
	'https://freedi-test.firebaseapp.com',
	// Local development
	'http://localhost:5173',
	'http://localhost:5174',
	'http://localhost:5175',
	'http://localhost:5176',
	'http://localhost:3000'
] as const;

export type AllowedOrigin = typeof ALLOWED_ORIGINS[number];
