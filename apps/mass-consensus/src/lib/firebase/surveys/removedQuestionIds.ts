import { QUESTION_SEARCH } from '@/constants/common';

/**
 * Validates the recently-removed question ids that arrive from the client:
 * an array of non-empty strings, trimmed, deduped (first occurrence wins, so
 * newest-first order is kept) and capped. Anything else is dropped (undefined).
 */
export function sanitizeRemovedQuestionIds(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const ids: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id && !ids.includes(id)) ids.push(id);
  }

  return ids.slice(0, QUESTION_SEARCH.MAX_REMOVED_IDS);
}
