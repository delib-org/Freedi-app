import type { Statement } from '@freedi/shared-types';

/** Case-insensitive substring match on the question text, newest first. No Firestore reads. */
export function filterQuestionsBySearch(questions: Statement[], search: string): Statement[] {
  const needle = search.toLowerCase().trim();
  if (!needle) return [];

  return questions
    .filter((q) => (q.statement || '').toLowerCase().includes(needle))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
