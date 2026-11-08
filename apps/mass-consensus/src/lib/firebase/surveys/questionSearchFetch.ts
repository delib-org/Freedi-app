import { Statement, StatementType, Collections, Role } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { QUESTION_SEARCH } from '@/constants/common';

type FirestoreAdmin = ReturnType<typeof getFirestoreAdmin>;

/**
 * Reads every question the user created, page by page (ordered by document id,
 * which needs no composite index), up to a safety cap. Used by search so that
 * old questions are found too.
 */
export async function scanCreatorQuestions(
  db: FirestoreAdmin,
  userId: string
): Promise<Statement[]> {
  const questions: Statement[] = [];
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (questions.length < QUESTION_SEARCH.MAX_CREATOR_DOCS) {
    let query = db
      .collection(Collections.statements)
      .where('creatorId', '==', userId)
      .where('statementType', '==', StatementType.question)
      .orderBy('__name__')
      .limit(QUESTION_SEARCH.SCAN_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    questions.push(...snapshot.docs.map((doc) => doc.data() as Statement));
    if (snapshot.docs.length < QUESTION_SEARCH.SCAN_PAGE_SIZE) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return questions;
}

/** Ids of statements the user is an admin of (via subscriptions) */
export async function getAdminStatementIds(
  db: FirestoreAdmin,
  userId: string
): Promise<Set<string>> {
  const snapshot = await db
    .collection(Collections.statementsSubscribe)
    .where('userId', '==', userId)
    .where('role', '==', Role.admin)
    .get();

  return new Set(snapshot.docs.map((doc) => doc.data().statementId as string));
}

/** One limited page of the user's own questions (used when not searching) */
export async function fetchCreatorQuestionsPage(
  db: FirestoreAdmin,
  userId: string,
  fetchLimit: number,
  cursor?: string
): Promise<Statement[]> {
  let query = db
    .collection(Collections.statements)
    .where('creatorId', '==', userId)
    .where('statementType', '==', StatementType.question)
    .limit(fetchLimit);

  if (cursor) {
    const cursorDoc = await db.collection(Collections.statements).doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => doc.data() as Statement);
}

/** Questions among the given statement ids (admin subscriptions), 30 ids per query */
export async function fetchAdminQuestions(
  db: FirestoreAdmin,
  adminIds: string[]
): Promise<Statement[]> {
  const questions: Statement[] = [];

  for (let i = 0; i < adminIds.length; i += QUESTION_SEARCH.IN_QUERY_BATCH) {
    const batch = adminIds.slice(i, i + QUESTION_SEARCH.IN_QUERY_BATCH);
    const snapshot = await db
      .collection(Collections.statements)
      .where('statementId', 'in', batch)
      .where('statementType', '==', StatementType.question)
      .get();
    questions.push(...snapshot.docs.map((doc) => doc.data() as Statement));
  }

  return questions;
}
