import { Statement, StatementType } from '@freedi/shared-types';

/** Parent id used by top-level statements; it is not a real statement to suggest */
const TOP_PARENT_ID = 'top';

/** The distinct parent ids of the selected questions (what to look up siblings of) */
export function getSuggestionParentIds(selectedQuestions: Statement[]): string[] {
  const ids = new Set<string>();
  for (const question of selectedQuestions) {
    if (question.parentId && question.parentId !== TOP_PARENT_ID) {
      ids.add(question.parentId);
    }
  }

  return Array.from(ids).sort();
}

/**
 * Picks what to suggest from the fetched candidates: questions (siblings of
 * the selected ones, or their parents), not already selected, newest first.
 */
export function selectSuggestedQuestions(
  selectedQuestions: Statement[],
  candidates: Statement[]
): Statement[] {
  const selectedIds = new Set(selectedQuestions.map((q) => q.statementId));
  const seen = new Set<string>();
  const suggestions: Statement[] = [];

  for (const candidate of candidates) {
    if (candidate.statementType !== StatementType.question) continue;
    if (selectedIds.has(candidate.statementId) || seen.has(candidate.statementId)) continue;
    seen.add(candidate.statementId);
    suggestions.push(candidate);
  }

  return suggestions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
