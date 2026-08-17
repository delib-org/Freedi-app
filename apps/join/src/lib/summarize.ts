// AI summary for a hub question: calls the shared `summarizeDiscussion`
// Cloud Function (me-west1), which writes `summary` + `summaryGeneratedAt`
// onto the question Statement doc — the hub's live listener then delivers it,
// so no client-side persistence is needed for generation. Only the manual
// "final touches" edit writes from the client.
import { Collections } from '@freedi/shared-types';
import { db, doc, setDoc, functions, httpsCallable } from '@/lib/firebase';

interface SummarizeDiscussionRequest {
	statementId: string;
	adminPrompt?: string;
	language?: string;
	includeSubQuestions?: boolean;
}

interface SummarizeDiscussionResponse {
	summary: string;
	questionTitle: string;
	totalParticipants: number;
	solutionsCount: number;
	subQuestionsCount: number;
	generatedAt: number;
}

/**
 * The question is not ready to summarize — no options passed the cutoff yet.
 * A configuration state for the facilitator to resolve, not an app fault.
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
 * Generate an AI summary of the hub question, built from the answers that
 * passed the cutoff of each sub-question (up to 2 levels deep).
 */
export async function requestHubSummary(
	statementId: string,
): Promise<SummarizeDiscussionResponse> {
	try {
		const summarizeDiscussion = httpsCallable<
			SummarizeDiscussionRequest,
			SummarizeDiscussionResponse
		>(functions, 'summarizeDiscussion');

		const result = await summarizeDiscussion({
			statementId,
			includeSubQuestions: true,
		});

		return result.data;
	} catch (error) {
		if (isPreconditionFailure(error)) {
			const message =
				error instanceof Error ? error.message : 'Question is not ready to summarize';
			throw new SummarizationNotReadyError(message);
		}
		console.error('[summarize] requestHubSummary failed:', error);
		throw error;
	}
}

/**
 * Save a facilitator-edited summary on the question statement. The summary
 * field is shared by all apps, so edits made here are visible everywhere.
 */
export async function updateStatementSummary(statementId: string, summary: string): Promise<void> {
	const now = Date.now();
	await setDoc(
		doc(db, Collections.statements, statementId),
		{ summary, summaryGeneratedAt: now, lastUpdate: now },
		{ merge: true },
	);
}
