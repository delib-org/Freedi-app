/**
 * Resolve the base URL for Firebase Cloud Functions (me-west1).
 * Used by API routes that delegate long-running work (AI processing) to
 * functions, which allow a 540s timeout vs Vercel's 30s.
 */
export function getFirebaseFunctionUrl(): string {
	if (process.env.FIREBASE_FUNCTIONS_URL) {
		return process.env.FIREBASE_FUNCTIONS_URL;
	}

	if (process.env.USE_FIREBASE_EMULATOR === 'true') {
		const projectId = process.env.FIREBASE_PROJECT_ID || 'freedi-test';

		return `http://localhost:5001/${projectId}/me-west1`;
	}

	return 'https://me-west1-wizcol-app.cloudfunctions.net';
}
