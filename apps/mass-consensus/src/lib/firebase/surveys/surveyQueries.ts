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
  const subscriptionsSnapshot = await db
    .collection(Collections.statementsSubscribe)
    .where('userId', '==', userId)
    .where('role', '==', Role.admin)
    .get();

  const adminStatementIds = new Set(
    subscriptionsSnapshot.docs.map((doc) => doc.data().statementId as string)
  );

  // Build the query for questions
  // We need to fetch questions where:
  // 1. creatorId === userId OR
  // 2. statementId is in adminStatementIds
  // Firestore doesn't support OR queries, so we'll query both and merge

  // Strategy: Fetch a larger batch and filter client-side for search
  // This is more efficient than multiple queries for text search
  const fetchLimit = search ? limit * 3 : limit + 1; // Fetch more if searching

  // Query 1: Questions created by user
  let creatorQuery = db
    .collection(Collections.statements)
    .where('creatorId', '==', userId)
    .where('statementType', '==', StatementType.question)
    .limit(fetchLimit);

  if (cursor) {
    const cursorDoc = await db.collection(Collections.statements).doc(cursor).get();
    if (cursorDoc.exists) {
      creatorQuery = creatorQuery.startAfter(cursorDoc);
    }
  }

  const creatorSnapshot = await creatorQuery.get();
  const creatorQuestions = creatorSnapshot.docs.map((doc) => doc.data() as Statement);

  // Query 2: Questions from admin subscriptions (batch query)
  const adminQuestions: Statement[] = [];
  if (adminStatementIds.size > 0) {
    const adminIds = Array.from(adminStatementIds);
    const batchSize = 30; // Firestore 'in' query limit

    for (let i = 0; i < Math.min(adminIds.length, batchSize * 3); i += batchSize) {
      const batch = adminIds.slice(i, i + batchSize);
      const adminSnapshot = await db
        .collection(Collections.statements)
        .where('statementId', 'in', batch)
        .where('statementType', '==', StatementType.question)
        .get();

      const batchQuestions = adminSnapshot.docs.map((doc) => doc.data() as Statement);
      adminQuestions.push(...batchQuestions);
    }
  }

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
