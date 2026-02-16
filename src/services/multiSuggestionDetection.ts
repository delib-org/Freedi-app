import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig } from '@freedi/shared-types';
import { logError, NetworkError } from '@/utils/errorHandling';

/**
 * Detected suggestion from multi-suggestion detection
 */
export interface DetectedSuggestion {
	title: string;
	description: string;
	originalText: string;
}

/**
 * Response from multi-suggestion detection
 */
export interface MultiSuggestionDetectionResponse {
	ok: boolean;
	isMultipleSuggestions: boolean;
	suggestions: DetectedSuggestion[];
	originalText: string;
	responseTime?: number;
	error?: string;
}

/**
 * Get the endpoint for multi-suggestion detection
 */
const getDetectMultiSuggestionEndpoint = (): string => {
	if (location.hostname === 'localhost') {
		return `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/detectMultipleSuggestions`;
	}

	return `https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/detectMultipleSuggestions`;
};

/**
 * Check if user input contains multiple suggestions
 * @param userInput - The user's input text
 * @param questionId - The parent question ID for context
 * @param userId - The user ID
 * @returns Detection result with split suggestions
 */
export async function detectMultipleSuggestions(
	userInput: string,
	questionId: string,
	userId: string,
): Promise<MultiSuggestionDetectionResponse> {
	const endpoint = getDetectMultiSuggestionEndpoint();

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userInput,
				questionId,
				userId,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
			throw new NetworkError(errorData.error || 'Failed to detect multiple suggestions', {
				status: response.status,
				questionId,
			});
		}

		const data: MultiSuggestionDetectionResponse = await response.json();

		return data;
	} catch (error) {
		logError(error, {
			operation: 'multiSuggestionDetection.detectMultipleSuggestions',
			userId,
			metadata: { questionId, userInputLength: userInput.length },
		});

		// Return safe default on error
		return {
			ok: false,
			isMultipleSuggestions: false,
			suggestions: [],
			originalText: userInput,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Check for multiple suggestions with timeout
 * @param userInput - The user's input text
 * @param questionId - The parent question ID for context
 * @param userId - The user ID
 * @param timeoutMs - Timeout in milliseconds (default: 15000)
 * @returns Detection result with split suggestions
 */
export async function detectMultipleSuggestionsWithTimeout(
	userInput: string,
	questionId: string,
	userId: string,
	timeoutMs: number = 15000,
): Promise<MultiSuggestionDetectionResponse> {
	return Promise.race([
		detectMultipleSuggestions(userInput, questionId, userId),
		new Promise<MultiSuggestionDetectionResponse>((_, reject) =>
			setTimeout(() => reject(new Error('Multi-suggestion detection timed out')), timeoutMs),
		),
	]).catch(() => ({
		ok: false,
		isMultipleSuggestions: false,
		suggestions: [],
		originalText: userInput,
		error: 'Detection timed out',
	}));
}
