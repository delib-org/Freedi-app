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
 * The discussion is not ready to be summarized yet — e.g. no solutions have been
 * selected because cutoff settings were never configured. This is a normal
 * configuration state that the admin must resolve, not an application fault, so
 * it is surfaced to the UI without being reported as an error.
 */
export class SummarizationNotReadyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SummarizationNotReadyError';
	}
}

function isPreconditionFailure(error: unknown): boolean {
	return (error as { code?: string })?.code === 'functions/failed-precondition';
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
		if (isPreconditionFailure(error)) {
			const message =
				error instanceof Error ? error.message : 'Discussion is not ready to summarize';
			logger.info('Summary requested before cutoff settings were configured', { statementId });

			throw new SummarizationNotReadyError(message);
		}

		logError(error, {
			operation: 'summarizationController.requestDiscussionSummary',
			statementId,
		});
		throw error;
	}
}
