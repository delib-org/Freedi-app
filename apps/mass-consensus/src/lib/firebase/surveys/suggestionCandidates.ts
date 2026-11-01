import { Statement, StatementType, Collections } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { QUESTION_SEARCH } from '@/constants/common';
import { getAdminStatementIds } from './questionSearchFetch';

/**
 * Candidates for the picker's "Suggested" section: questions that share a
 * parent with the given ones, plus the parent statements themselves (when they
 * are questions). Only statements the user can access (created, or admin of)
 * are returned.
 */
export async function fetchSuggestionCandidates(
  userId: string,
  parentIds: string[]
): Promise<Statement[]> {
  const ids = parentIds.slice(0, QUESTION_SEARCH.IN_QUERY_BATCH);
  if (ids.length === 0) return [];

  const db = getFirestoreAdmin();
  const [siblingsSnapshot, parentsSnapshot, adminIds] = await Promise.all([
    db
      .collection(Collections.statements)
      .where('parentId', 'in', ids)
      .where('statementType', '==', StatementType.question)
      .get(),
    db.collection(Collections.statements).where('statementId', 'in', ids).get(),
    getAdminStatementIds(db, userId),
  ]);

  const byId = new Map<string, Statement>();
  for (const doc of [...siblingsSnapshot.docs, ...parentsSnapshot.docs]) {
    const statement = doc.data() as Statement;
    if (statement.statementType !== StatementType.question) continue;
    if (statement.creatorId === userId || adminIds.has(statement.statementId)) {
      byId.set(statement.statementId, statement);
    }
  }

  return Array.from(byId.values());
}
