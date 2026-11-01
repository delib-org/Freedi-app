import { useEffect, useRef, useState } from 'react';
import type { Statement } from '@freedi/shared-types';
import { authedFetch } from '@/lib/api/authedFetch';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Resolves the recently-removed question ids to statements (fetching only ids
 * not seen yet). Ids the admin can no longer access never resolve, so they are
 * not shown. Result keeps the order of `removedIds`.
 */
export function useRemovedQuestions(removedIds: string[]): Statement[] {
  const cacheRef = useRef<Map<string, Statement>>(new Map());
  const [version, setVersion] = useState(0);
  const idsKey = removedIds.join(',');

  useEffect(() => {
    const missing = removedIds.filter((id) => !cacheRef.current.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        const response = await authedFetch(
          `/api/questions?ids=${encodeURIComponent(missing.join(','))}`
        );
        if (!response.ok) return;

        const data: { questions: Statement[] } = await response.json();
        if (cancelled) return;
        data.questions.forEach((q) => cacheRef.current.set(q.statementId, q));
        setVersion((v) => v + 1);
      } catch (error) {
        logError(error, { operation: 'useRemovedQuestions.load', metadata: { idsKey } });
      }
    };
    load();

    return () => {
      cancelled = true;
    };
    // removedIds is represented by idsKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // version forces a re-read of the cache after a fetch lands
  void version;

  return removedIds
    .map((id) => cacheRef.current.get(id))
    .filter((q): q is Statement => q !== undefined);
}
