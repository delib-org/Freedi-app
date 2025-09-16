import firebaseConfig from "@/controllers/db/configKey";
import { functionConfig } from "delib-npm";

// Endpoint configuration
const getImproveSuggestionEndpoint = () => {
	return location.hostname === 'localhost'
		? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/improveSuggestion`
		: import.meta.env.VITE_APP_IMPROVE_SUGGESTION_ENDPOINT ||
		  `https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/improveSuggestion`;
};

interface ImproveSuggestionRequest {
	title: string;
	description?: string;
	instructions?: string;
}

interface ImproveSuggestionResponse {
	improvedTitle: string;
	improvedDescription?: string;
	detectedLanguage: string;
}

/**
 * Calls the Firebase function to improve a suggestion using AI
 * @param title - The original suggestion title
 * @param description - The original suggestion description
 * @param instructions - Optional user instructions for improvement
 * @returns Promise containing the improved title, description and detected language
 */
export async function improveSuggestion(
	title: string,
	description?: string,
	instructions?: string
): Promise<ImproveSuggestionResponse> {
	try {
		const endpoint = getImproveSuggestionEndpoint();

		const requestBody: ImproveSuggestionRequest = {
			title,
			description,
			instructions,
		};

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				errorData.message || `Failed to improve suggestion: ${response.statusText}`
			);
		}

		const data: ImproveSuggestionResponse = await response.json();

		if (!data.improvedTitle) {
			throw new Error('Invalid response from improvement service');
		}

		return data;
	} catch (error) {
		console.error('Error improving suggestion:', error);
		throw error;
	}
}

/**
 * Improve suggestion with timeout to prevent long waits
 * @param title - The original suggestion title
 * @param description - The original suggestion description
 * @param instructions - Optional user instructions for improvement
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Promise containing the improved title, description and detected language
 */
export async function improveSuggestionWithTimeout(
	title: string,
	description?: string,
	instructions?: string,
	timeoutMs: number = 30000
): Promise<ImproveSuggestionResponse> {
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('Improvement request timed out')), timeoutMs);
	});

	try {
		return await Promise.race([
			improveSuggestion(title, description, instructions),
			timeoutPromise,
		]);
	} catch (error) {
		if (error instanceof Error && error.message === 'Improvement request timed out') {
			console.error('Suggestion improvement timed out');
		}
		throw error;
	}
}