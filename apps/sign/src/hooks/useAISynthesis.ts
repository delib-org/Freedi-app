/**
 * useAISynthesis Hook
 *
 * Manages the AI synthesis flow state (loading, result, error).
 */

'use client';

import { useState, useCallback } from 'react';
import { API_ROUTES } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';

interface SuggestionInput {
	suggestionId: string;
	suggestedContent: string;
	consensus: number;
	creatorDisplayName: string;
}

interface SynthesisResult {
	synthesizedText: string;
	reasoning: string;
	sourceSuggestionIds: string[];
}

interface ImproveResult {
	improvedText: string;
	changes: Array<{ description: string; fromComment?: string }>;
}

interface CommentInput {
	commentId: string;
	content: string;
	consensus: number;
	creatorDisplayName: string;
}

export function useAISynthesis() {
	const [isLoading, setIsLoading] = useState(false);
	const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
	const [improveResult, setImproveResult] = useState<ImproveResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const synthesize = useCallback(async (
		paragraphId: string,
		originalContent: string,
		suggestions: SuggestionInput[],
	): Promise<SynthesisResult | null> => {
		setIsLoading(true);
		setError(null);
		setSynthesisResult(null);

		try {
			const response = await fetch(API_ROUTES.ADMIN_REFINEMENT(paragraphId), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'synthesize',
					originalContent,
					suggestions,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Synthesis failed');
			}

			const data = await response.json();
			const result = data.result as SynthesisResult;
			setSynthesisResult(result);

			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Synthesis failed';
			setError(message);
			logError(err, {
				operation: 'hooks.useAISynthesis.synthesize',
				paragraphId,
			});

			return null;
		} finally {
			setIsLoading(false);
		}
	}, []);

	const improve = useCallback(async (
		paragraphId: string,
		suggestionId: string,
		suggestionContent: string,
		comments: CommentInput[],
		originalParagraphContent: string,
	): Promise<ImproveResult | null> => {
		setIsLoading(true);
		setError(null);
		setImproveResult(null);

		try {
			const response = await fetch(API_ROUTES.ADMIN_REFINEMENT(paragraphId), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'improve',
					suggestionId,
					suggestionContent,
					comments,
					originalParagraphContent,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Improvement failed');
			}

			const data = await response.json();
			const result = data.result as ImproveResult;
			setImproveResult(result);

			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Improvement failed';
			setError(message);
			logError(err, {
				operation: 'hooks.useAISynthesis.improve',
				paragraphId,
				metadata: { suggestionId },
			});

			return null;
		} finally {
			setIsLoading(false);
		}
	}, []);

	const setPhase = useCallback(async (
		paragraphId: string,
		phase: 'open' | 'refinement',
		consensusThreshold?: number,
	): Promise<boolean> => {
		try {
			const response = await fetch(API_ROUTES.ADMIN_REFINEMENT(paragraphId), {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'setPhase',
					phase,
					consensusThreshold,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Phase change failed');
			}

			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Phase change failed';
			setError(message);
			logError(err, {
				operation: 'hooks.useAISynthesis.setPhase',
				paragraphId,
				metadata: { phase },
			});

			return false;
		}
	}, []);

	const reset = useCallback(() => {
		setSynthesisResult(null);
		setImproveResult(null);
		setError(null);
		setIsLoading(false);
	}, []);

	return {
		isLoading,
		synthesisResult,
		improveResult,
		error,
		synthesize,
		improve,
		setPhase,
		reset,
	};
}
