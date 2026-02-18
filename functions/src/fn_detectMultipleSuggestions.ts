import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import {
	detectAndSplitMultipleSuggestions,
	checkForInappropriateContent,
	DetectedSuggestion,
} from './services/ai-service';
import { getCachedParentStatement } from './services/cached-statement-service';

/**
 * Request body for detect multiple suggestions
 */
interface DetectMultipleSuggestionsRequest {
	userInput: string;
	questionId: string;
	userId: string;
}

/**
 * Response for detect multiple suggestions
 */
interface DetectMultipleSuggestionsResponse {
	ok: boolean;
	isMultipleSuggestions: boolean;
	suggestions: DetectedSuggestion[];
	originalText: string;
	cached?: boolean;
	responseTime?: number;
	error?: string;
}

/**
 * Cloud Function to detect if user input contains multiple suggestions
 * and split them into separate proposals.
 *
 * Used by both Mass Consensus app (always enabled) and main app (admin-controlled).
 */
export async function detectMultipleSuggestions(
	request: Request,
	response: Response,
): Promise<void> {
	const startTime = Date.now();

	try {
		const { userInput, questionId, userId } = request.body as DetectMultipleSuggestionsRequest;

		// Validate required fields
		if (!userInput || !userId) {
			response.status(400).send({
				ok: false,
				error: 'Missing required fields: userInput and userId',
				isMultipleSuggestions: false,
				suggestions: [],
				originalText: userInput || '',
			} as DetectMultipleSuggestionsResponse);

			return;
		}

		// Log request for monitoring
		logger.info('detectMultipleSuggestions request', {
			questionId,
			userInputLength: userInput.length,
			userId,
		});

		// Step 1: Check for inappropriate content first
		const contentCheck = await checkForInappropriateContent(userInput);

		if (contentCheck.isInappropriate) {
			logger.warn('Inappropriate content detected in multi-suggestion check', { userId });
			response.status(400).send({
				ok: false,
				error: 'Input contains inappropriate content',
				isMultipleSuggestions: false,
				suggestions: [],
				originalText: userInput,
			} as DetectMultipleSuggestionsResponse);

			return;
		}

		// Step 2: Get question context if available
		let questionContext = '';
		if (questionId) {
			try {
				const parentStatement = await getCachedParentStatement(questionId);
				if (parentStatement) {
					questionContext = parentStatement.statement || '';
				}
			} catch (error) {
				logger.warn('Failed to get parent statement for context', { questionId, error });
				// Continue without context - not a critical error
			}
		}

		// Step 3: Detect and split multiple suggestions
		const result = await detectAndSplitMultipleSuggestions(userInput, questionContext);

		const responseTime = Date.now() - startTime;

		logger.info('detectMultipleSuggestions completed', {
			isMultiple: result.isMultiple,
			suggestionsCount: result.suggestions.length,
			responseTime,
		});

		response.status(200).send({
			ok: true,
			isMultipleSuggestions: result.isMultiple,
			suggestions: result.suggestions,
			originalText: userInput,
			responseTime,
		} as DetectMultipleSuggestionsResponse);
	} catch (error) {
		const errorTime = Date.now() - startTime;
		logger.error('Error in detectMultipleSuggestions:', {
			error,
			responseTime: errorTime,
		});

		response.status(500).send({
			ok: false,
			error: 'Internal server error',
			isMultipleSuggestions: false,
			suggestions: [],
			originalText: '',
		} as DetectMultipleSuggestionsResponse);
	}
}
