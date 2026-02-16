import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import { improveSuggestion } from './services/ai-service';

interface ImproveSuggestionRequest {
	title: string;
	description?: string;
	instructions?: string;
	parentTitle?: string;
	parentDescription?: string;
}

interface ImproveSuggestionResponse {
	improvedTitle: string;
	improvedDescription?: string;
	detectedLanguage: string;
}

/**
 * HTTP function to improve a suggestion using AI
 * @param req - Request containing the original text and optional instructions
 * @param res - Response with the improved text
 */
export async function handleImproveSuggestion(req: Request, res: Response): Promise<void> {
	try {
		// Validate request method
		if (req.method !== 'POST') {
			res.status(405).json({ error: 'Method not allowed' });

			return;
		}

		// Extract and validate request body
		const { title, description, instructions, parentTitle, parentDescription } =
			req.body as ImproveSuggestionRequest;

		if (!title || typeof title !== 'string' || title.trim().length === 0) {
			res.status(400).json({ error: 'Title is required and must be a non-empty string' });

			return;
		}

		// Log the request for monitoring
		logger.info('Improving suggestion', {
			titleLength: title.length,
			hasDescription: !!description,
			hasInstructions: !!instructions,
			hasParentContext: !!parentTitle,
		});

		// Call the AI service to improve the suggestion - language will be detected by AI
		const result = await improveSuggestion(
			title,
			description,
			instructions,
			parentTitle,
			parentDescription,
		);

		// Send successful response
		const response: ImproveSuggestionResponse = {
			improvedTitle: result.improvedTitle,
			improvedDescription: result.improvedDescription,
			detectedLanguage: result.detectedLanguage,
		};

		res.status(200).json(response);
	} catch (error) {
		logger.error('Error improving suggestion', error);

		// Send error response
		res.status(500).json({
			error: 'Failed to improve suggestion',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
