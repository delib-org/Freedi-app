import { useEffect, useMemo, useState } from 'react';
import type { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';
import { getSuggestionParentIds, selectSuggestedQuestions } from './suggestedQuestions';

/**
 * Questions worth adding next: siblings of (and parents of) the questions
 * already in the survey, minus the ones already selected.
 */
export function useSuggestedQuestions(selectedQuestions: Statement[]): Statement[] {
  const [candidates, setCandidates] = useState<Statement[]>([]);
  const parentKey = getSuggestionParentIds(selectedQuestions).join(',');

  useEffect(() => {
    if (!parentKey) {
      setCandidates([]);

      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await authedFetch(
          `/api/questions/suggested?parentIds=${encodeURIComponent(parentKey)}`
        );
        if (!response.ok) return;

        const data: { questions: Statement[] } = await response.json();
        if (!cancelled) setCandidates(data.questions);
      } catch (error) {
        logError(error, {
          operation: 'useSuggestedQuestions.load',
          metadata: { parentKey },
        });
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [parentKey]);

  return useMemo(
    () => selectSuggestedQuestions(selectedQuestions, candidates),
    [selectedQuestions, candidates]
  );
}
