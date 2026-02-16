import { useState, useCallback } from 'react';
import { requestDiscussionSummary } from '@/controllers/db/summarization/summarizationController';
import { logError } from '@/utils/errorHandling';

interface UseSummarizationResult {
	isGenerating: boolean;
	error: string | null;
	generateSummary: (statementId: string, customPrompt?: string) => Promise<boolean>;
	clearError: () => void;
}

/**
 * Hook for managing discussion summarization state and API calls
 */
export const useSummarization = (): UseSummarizationResult => {
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const generateSummary = useCallback(
		async (statementId: string, customPrompt?: string): Promise<boolean> => {
			try {
				setIsGenerating(true);
				setError(null);

				await requestDiscussionSummary(statementId, customPrompt);

				// Summary is saved directly to Firestore by the Cloud Function
				// The statement will be updated via the real-time listener
				return true;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary';
				setError(errorMessage);
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
	}, []);

	return {
		isGenerating,
		error,
		generateSummary,
		clearError,
	};
};
