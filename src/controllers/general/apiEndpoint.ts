import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig } from '@freedi/shared-types';

// Helper to get environment variables
// In tests, babel-plugin-transform-vite-meta-env transforms import.meta.env to process.env
function getEnvVar(key: string): string | undefined {
	return import.meta.env[key];
}

/**
 * Generates an API endpoint for Firebase Cloud Functions
 * @param {string} functionName - The name of the Firebase function
 * @param {Record<string, string|number>} queryParams - Query parameters to append to the URL
 * @param {string} envVarName - Optional environment variable name to use for production endpoints
 * @returns {string} - The complete API endpoint URL
 */
export function APIEndPoint(
	functionName: string,
	queryParams: Record<string, string | number>,
	envVarName?: string,
): string {
	// Convert query parameters to URL search params
	const queryString = Object.entries(queryParams)
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&');

	// Check if running on localhost
	if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
		// Use the project ID from the Firebase configuration
		return `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/${functionName}${queryString ? '?' : ''}${queryString}`;
	}

	// For production, use the provided environment variable or construct a default one
	const envVar = envVarName
		? getEnvVar(envVarName)
		: getEnvVar(`VITE_APP_${functionName.toUpperCase()}_ENDPOINT`);

	// If the environment variable exists, use it, otherwise use a standard pattern
	if (envVar) {
		return `${envVar}?${queryString}`;
	}

	// Fallback if no environment variable is found
	return `https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/${functionName}?${queryString}`;
}
