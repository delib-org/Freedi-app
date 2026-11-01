import {
  Statement,
  StatementType,
  Collections,
  Role,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { Survey, SurveyStatus } from '@/types/survey';
import { logger } from '@/lib/utils/logger';
import { SURVEYS_COLLECTION } from './surveyHelpers';
import { QUESTION_SEARCH } from '@/constants/common';
import {
  scanCreatorQuestions,
  fetchCreatorQuestionsPage,
  fetchAdminQuestions,
  getAdminStatementIds,
} from './questionSearchFetch';

/**
 * Get questions created by an admin
 * Note: Removed orderBy to avoid requiring a composite index
 * Sorting is done in getAvailableQuestions after merging results
 */
export async function getQuestionsByCreator(creatorId: string): Promise<Statement[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(Collections.statements)
    .where('creatorId', '==', creatorId)
    .where('statementType', '==', StatementType.question)
    .get();

  const questions = snapshot.docs.map((doc) => doc.data() as Statement);
  logger.info('[getQuestionsByCreator] Found', questions.length, 'questions for creator:', creatorId);

  return questions;
}

/**
 * Get questions where user has admin role (via statementsSubscribe)
 */
export async function getQuestionsWithAdminAccess(userId: string): Promise<Statement[]> {
  const db = getFirestoreAdmin();

  // First get all statement subscriptions where user is admin
  const subscriptionsSnapshot = await db
    .collection(Collections.statementsSubscribe)
    .where('userId', '==', userId)
    .where('role', '==', Role.admin)
    .get();

  if (subscriptionsSnapshot.empty) {
    return [];
  }

  const statementIds = subscriptionsSnapshot.docs.map(
    (doc) => doc.data().statementId as string
  );

  // Fetch the statements in batches (Firestore 'in' query limit is 30)
  const questions: Statement[] = [];
  const batchSize = 30;

  for (let i = 0; i < statementIds.length; i += batchSize) {
    const batch = statementIds.slice(i, i + batchSize);
    const statementsSnapshot = await db
      .collection(Collections.statements)
      .where('statementId', 'in', batch)
      .where('statementType', '==', StatementType.question)
      .get();

    const batchQuestions = statementsSnapshot.docs.map((doc) => doc.data() as Statement);
    questions.push(...batchQuestions);
  }

  logger.info('[getQuestionsWithAdminAccess] Found', questions.length, 'questions for admin:', userId);

  return questions;
}

/**
 * Get all questions available to an admin (created + admin access)
 * @deprecated Use searchQuestions for better performance with large datasets
 */
export async function getAvailableQuestions(adminId: string): Promise<Statement[]> {
  const [createdQuestions, adminQuestions] = await Promise.all([
    getQuestionsByCreator(adminId),
    getQuestionsWithAdminAccess(adminId),
  ]);

  // Merge and deduplicate
  const questionMap = new Map<string, Statement>();

  for (const q of createdQuestions) {
    questionMap.set(q.statementId, q);
  }

  for (const q of adminQuestions) {
    if (!questionMap.has(q.statementId)) {
      questionMap.set(q.statementId, q);
    }
  }

  const questions = Array.from(questionMap.values());

  // Sort by creation date descending
  questions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  logger.info('[getAvailableQuestions] Total available questions:', questions.length);

  return questions;
}

/**
 * Every question the user can access (created, or admin of), newest first.
 * Fetched once per picker session; the browser filters it locally.
 */
export async function getAllAccessibleQuestions(userId: string): Promise<Statement[]> {
  const db = getFirestoreAdmin();
  const adminStatementIds = await getAdminStatementIds(db, userId);
  const [creatorQuestions, adminQuestions] = await Promise.all([
    scanCreatorQuestions(db, userId),
    fetchAdminQuestions(db, Array.from(adminStatementIds).slice(0, QUESTION_SEARCH.MAX_ADMIN_IDS)),
  ]);

  const byId = new Map<string, Statement>();
  for (const q of [...creatorQuestions, ...adminQuestions]) {
    if (!byId.has(q.statementId)) byId.set(q.statementId, q);
  }

  return Array.from(byId.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

interface SearchQuestionsOptions {
  search?: string;
  limit?: number;
  cursor?: string;
}

interface SearchQuestionsResult {
  questions: Statement[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

/**
 * Search questions with pagination and text search
 * Searches in questions the user created or has admin access to
 */
export async function searchQuestions(
  userId: string,
  options: SearchQuestionsOptions = {}
): Promise<SearchQuestionsResult> {
  const db = getFirestoreAdmin();
  const { search = '', limit = 20, cursor } = options;
  const searchLower = search.toLowerCase().trim();

  // First, get all statement IDs user has access to via admin subscriptions
  const adminStatementIds = await getAdminStatementIds(db, userId);

  // Build the query for questions
  // We need to fetch questions where:
  // 1. creatorId === userId OR
  // 2. statementId is in adminStatementIds
  // Firestore doesn't support OR queries, so we'll query both and merge

  // Searching scans everything the admin can access, of any age: the match is an
  // in-memory substring test, so a size-limited unordered fetch would miss old
  // questions. Browsing without a search keeps the cheap limited fetch.
  const creatorQuestions = searchLower
    ? await scanCreatorQuestions(db, userId)
    : await fetchCreatorQuestionsPage(db, userId, limit + 1, cursor);

  const adminIdLimit = searchLower ? QUESTION_SEARCH.MAX_ADMIN_IDS : QUESTION_SEARCH.BROWSE_ADMIN_IDS;
  const adminQuestions = await fetchAdminQuestions(
    db,
    Array.from(adminStatementIds).slice(0, adminIdLimit)
  );

  // Merge and deduplicate
  const questionMap = new Map<string, Statement>();
  for (const q of creatorQuestions) {
    questionMap.set(q.statementId, q);
  }
  for (const q of adminQuestions) {
    if (!questionMap.has(q.statementId)) {
      questionMap.set(q.statementId, q);
    }
  }

  let allQuestions = Array.from(questionMap.values());

  // Apply text search filter if provided
  if (searchLower) {
    allQuestions = allQuestions.filter((q) =>
      q.statement.toLowerCase().includes(searchLower)
    );
  }

  // Sort by creation date descending
  allQuestions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Apply cursor-based filtering (skip items before cursor)
  if (cursor) {
    const cursorIndex = allQuestions.findIndex((q) => q.statementId === cursor);
    if (cursorIndex !== -1) {
      allQuestions = allQuestions.slice(cursorIndex + 1);
    }
  }

  // Paginate
  const hasMore = allQuestions.length > limit;
  const questions = allQuestions.slice(0, limit);
  const nextCursor = hasMore && questions.length > 0
    ? questions[questions.length - 1].statementId
    : null;

  logger.info(
    '[searchQuestions] Found',
    questions.length,
    'questions for user:',
    userId,
    search ? `(search: "${search}")` : '',
    `hasMore: ${hasMore}`
  );

  return {
    questions,
    nextCursor,
    hasMore,
  };
}

/**
 * Get surveys by status
 * REQUIRES Firestore composite index: creatorId + status + createdAt (desc)
 */
export async function getSurveysByStatus(
  creatorId: string,
  status: SurveyStatus
): Promise<Survey[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEYS_COLLECTION)
    .where('creatorId', '==', creatorId)
    .where('status', '==', status)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as Survey);
}
