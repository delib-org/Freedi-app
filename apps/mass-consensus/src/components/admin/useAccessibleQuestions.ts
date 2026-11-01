import { useCallback, useEffect, useRef } from 'react';
import type { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { httpErrorFromResponse } from '@/lib/utils/errorHandling';

/**
 * Loads every question the admin can access, once per picker session (on the
 * first call), so searching afterwards is a local filter with no Firestore
 * reads. Concurrent callers share one request; a failed load can be retried.
 * The request is aborted when the picker unmounts.
 */
export function useAccessibleQuestions(): () => Promise<Statement[]> {
  const cacheRef = useRef<Promise<Statement[]> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return useCallback(() => {
    if (cacheRef.current) return cacheRef.current;

    const controller = new AbortController();
    abortRef.current = controller;
    const request = (async () => {
      const response = await authedFetch('/api/questions?scope=all', { signal: controller.signal });
      if (!response.ok) {
        throw await httpErrorFromResponse(response, 'Failed to fetch accessible questions');
      }
      const data: { questions: Statement[] } = await response.json();

      return data.questions;
    })();
    cacheRef.current = request;
    request.catch(() => {
      cacheRef.current = null;
    });

    return request;
  }, []);
}
