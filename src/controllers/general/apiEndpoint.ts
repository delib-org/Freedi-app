import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig } from 'delib-npm';

// Helper function to safely get environment variables (compatible with both Vite and Jest)
function getEnvVar(key: string): string | undefined {
	// In test environment, use process.env
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
		return process.env[key];
	}
	// In browser/Vite environment, use import.meta.env
	// Use eval to avoid syntax errors in test environment
	try {
		// eslint-disable-next-line no-eval
		const envObj = eval('import.meta.env');
		return envObj[key] as string | undefined;
	} catch {
		return undefined;
	}
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
	envVarName?: string
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
