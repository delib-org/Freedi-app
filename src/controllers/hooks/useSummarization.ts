import { useState, useCallback } from 'react';
import {
	requestDiscussionSummary,
	SummarizationNotReadyError,
} from '@/controllers/db/summarization/summarizationController';
import { logError } from '@/utils/errorHandling';

interface UseSummarizationResult {
	isGenerating: boolean;
	error: string | null;
	/**
	 * 'not-ready' means the admin must configure cutoff settings before a summary
	 * can be generated — show a prompt, not a failure. 'failed' is a real error.
	 */
	errorKind: 'not-ready' | 'failed' | null;
	generateSummary: (
		statementId: string,
		customPrompt?: string,
		includeSubQuestions?: boolean,
	) => Promise<boolean>;
	clearError: () => void;
}

/**
 * Hook for managing discussion summarization state and API calls
 */
export const useSummarization = (): UseSummarizationResult => {
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [errorKind, setErrorKind] = useState<'not-ready' | 'failed' | null>(null);

	const generateSummary = useCallback(
		async (
			statementId: string,
			customPrompt?: string,
			includeSubQuestions?: boolean,
		): Promise<boolean> => {
			try {
				setIsGenerating(true);
				setError(null);
				setErrorKind(null);

				await requestDiscussionSummary(statementId, customPrompt, { includeSubQuestions });

				// Summary is saved directly to Firestore by the Cloud Function
				// The statement will be updated via the real-time listener
				return true;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary';
				setError(errorMessage);

				// Missing cutoff settings is an admin configuration step, not a bug —
				// surface it to the UI without adding noise to the error tracker.
				if (err instanceof SummarizationNotReadyError) {
					setErrorKind('not-ready');

					return false;
				}

				setErrorKind('failed');
				logError(err, {
					operation: 'useSummarization.generateSummary',
					statementId,
				});

				return false;
			} finally {
				setIsGenerating(false);
			}
		},
		[],
	);

	const clearError = useCallback(() => {
		setError(null);
		setErrorKind(null);
	}, []);

	return {
		isGenerating,
		error,
		errorKind,
		generateSummary,
		clearError,
	};
};
