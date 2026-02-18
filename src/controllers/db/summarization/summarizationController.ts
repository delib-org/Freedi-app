import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';

interface SummarizeDiscussionRequest {
	statementId: string;
	adminPrompt?: string;
	language?: string;
}

interface SummarizeDiscussionResponse {
	summary: string;
	questionTitle: string;
	totalParticipants: number;
	solutionsCount: number;
	generatedAt: number;
}

/**
 * Request AI-generated summary for a discussion
 * @param statementId - The ID of the question statement to summarize
 * @param adminPrompt - Optional custom instructions for the AI
 * @param language - Optional language code (auto-detected if not provided)
 */
export async function requestDiscussionSummary(
	statementId: string,
	adminPrompt?: string,
	language?: string,
): Promise<SummarizeDiscussionResponse> {
	try {
		const summarizeDiscussion = httpsCallable<
			SummarizeDiscussionRequest,
			SummarizeDiscussionResponse
		>(functions, 'summarizeDiscussion');

		const result = await summarizeDiscussion({
			statementId,
			adminPrompt,
			language,
		});

		logger.info('Discussion summary requested', {
			statementId,
			solutionsCount: result.data.solutionsCount,
			totalParticipants: result.data.totalParticipants,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'summarizationController.requestDiscussionSummary',
			statementId,
		});
		throw error;
	}
}
