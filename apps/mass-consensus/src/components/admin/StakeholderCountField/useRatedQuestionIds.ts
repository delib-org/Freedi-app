'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';

interface FunnelItem {
	questionId: string;
	usersEvaluated: number;
}

interface StatsResponse {
	questionFunnel?: FunnelItem[];
}

/** Which of the survey's questions already have ratings (edit mode only). */
export function useRatedQuestionIds(surveyId: string | undefined, questionIds: string[]): string[] {
	const [rated, setRated] = useState<string[]>([]);
	const questionKey = questionIds.join(',');

	useEffect(() => {
		if (!surveyId) return;
		let cancelled = false;

		const load = async (): Promise<void> => {
			try {
				const response = await authedFetch(`/api/surveys/${surveyId}/stats?includeFunnel=true`);
				if (!response.ok) return;
				const stats = (await response.json()) as StatsResponse;
				const selected = new Set(questionKey ? questionKey.split(',') : []);
				const ids = (stats.questionFunnel ?? [])
					.filter((item) => item.usersEvaluated > 0 && selected.has(item.questionId))
					.map((item) => item.questionId);
				if (!cancelled) setRated(ids);
			} catch (error) {
				logError(error, { operation: 'useRatedQuestionIds.load', metadata: { surveyId } });
			}
		};
		load();

		return () => {
			cancelled = true;
		};
	}, [surveyId, questionKey]);

	return rated;
}
