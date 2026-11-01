import { useEffect, useRef, useState } from 'react';
import { QUESTION_SEARCH_CONFIG } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';
import { UI } from '@/constants/common';

interface SimilarByMeaning {
  questions: Statement[];
  loading: boolean;
}

/**
 * Questions close in meaning to the search text. Waits for a quiet moment
 * (each call costs an embedding plus reads), answers each query string at most
 * once per picker session, and ignores superseded responses. Errors only
 * hide the section; they never block the text results.
 */
export function useSimilarByMeaning(search: string): SimilarByMeaning {
  const cacheRef = useRef<Map<string, Statement[]>>(new Map());
  const [questions, setQuestions] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = search.trim();
    if (query.length < QUESTION_SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      setQuestions([]);
      setLoading(false);

      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setQuestions(cached);
      setLoading(false);

      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setQuestions([]);
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await authedFetch('/api/questions/by-meaning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`by-meaning responded ${response.status}`);

        const data: { questions: Statement[] } = await response.json();
        cacheRef.current.set(cacheKey, data.questions);
        if (!cancelled) setQuestions(data.questions);
      } catch (error) {
        if (cancelled) return;
        logError(error, { operation: 'useSimilarByMeaning.search', metadata: { query } });
        setQuestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, UI.MEANING_SEARCH_DEBOUNCE);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  return { questions, loading };
}
