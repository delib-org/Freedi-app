import { useEffect, useRef } from 'react';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';

interface UseEvaluationListenerProps {
	statementId?: string;
	enabled?: boolean;
}

/**
 * Hook to manage evaluation listeners at the page/component level
 * This should be used sparingly and only at the top level of pages that need evaluations
 * Do NOT use in individual card components
 */
export const useEvaluationListener = ({
	statementId,
	enabled = true,
}: UseEvaluationListenerProps) => {
	const unsubscribeRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		// Only set up listener if enabled and we have a statementId
		if (!enabled || !statementId) return;

		// Clean up any existing listener
		if (unsubscribeRef.current) {
			unsubscribeRef.current();
		}

		// Set up new listener
		unsubscribeRef.current = listenToEvaluations(statementId);

		// Cleanup on unmount or when dependencies change
		return () => {
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
				unsubscribeRef.current = null;
			}
		};
	}, [statementId, enabled]);
};
