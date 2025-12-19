import { Statement, StatementType, Collections, Role } from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';
import {
  Survey,
  SurveyProgress,
  SurveyWithQuestions,
  CreateSurveyRequest,
  UpdateSurveyRequest,
  DEFAULT_SURVEY_SETTINGS,
  SurveyStatus,
} from '@/types/survey';
import { logger } from '@/lib/utils/logger';

/** Collection name for surveys */
const SURVEYS_COLLECTION = 'surveys';
/** Collection name for survey progress */
const SURVEY_PROGRESS_COLLECTION = 'surveyProgress';

/**
 * Generate a unique survey ID
 */
function generateSurveyId(): string {
  return `survey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate progress document ID
 */
function generateProgressId(surveyId: string, userId: string): string {
  return `${surveyId}--${userId}`;
}

// ============================================
// SURVEY CRUD OPERATIONS
// ============================================

/**
 * Create a new survey
 */
export async function createSurvey(
  creatorId: string,
  data: CreateSurveyRequest
): Promise<Survey> {
  const db = getFirestoreAdmin();
  const now = Date.now();

  const survey: Survey = {
    surveyId: generateSurveyId(),
    title: data.title,
    description: data.description || '',
    creatorId,
    questionIds: data.questionIds || [],
    settings: {
      ...DEFAULT_SURVEY_SETTINGS,
      ...data.settings,
    },
    questionSettings: data.questionSettings || {},
    status: SurveyStatus.draft,
    createdAt: now,
    lastUpdate: now,
  };

  await db.collection(SURVEYS_COLLECTION).doc(survey.surveyId).set(survey);

  logger.info('[createSurvey] Created survey:', survey.surveyId, 'with questionSettings:', JSON.stringify(survey.questionSettings));
  return survey;
}

/**
 * Get a survey by ID
 */
export async function getSurveyById(surveyId: string): Promise<Survey | null> {
  const db = getFirestoreAdmin();

  const doc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();

  if (!doc.exists) {
    logger.info('[getSurveyById] Survey not found:', surveyId);
    return null;
  }

  return doc.data() as Survey;
}

/**
 * Get a survey with populated question data
 */
export async function getSurveyWithQuestions(
  surveyId: string
): Promise<SurveyWithQuestions | null> {
  const db = getFirestoreAdmin();

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  // Fetch all questions in parallel
  const questionPromises = survey.questionIds.map(async (questionId) => {
    const doc = await db.collection(Collections.statements).doc(questionId).get();
    return doc.exists ? (doc.data() as Statement) : null;
  });

  const questionsResults = await Promise.all(questionPromises);
  const questions = questionsResults.filter((q): q is Statement => q !== null);

  logger.info('[getSurveyWithQuestions] Loaded', questions.length, 'questions for survey:', surveyId);

  return {
    ...survey,
    questions,
  };
}

/**
 * Update a survey
 */
export async function updateSurvey(
  surveyId: string,
  data: UpdateSurveyRequest
): Promise<Survey | null> {
  const db = getFirestoreAdmin();

  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const updates: Partial<Survey> = {
    lastUpdate: Date.now(),
  };

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.questionIds !== undefined) updates.questionIds = data.questionIds;
  if (data.status !== undefined) updates.status = data.status as SurveyStatus;
  if (data.settings !== undefined) {
    updates.settings = {
      ...survey.settings,
      ...data.settings,
    };
  }
  if (data.questionSettings !== undefined) {
    updates.questionSettings = {
      ...(survey.questionSettings || {}),
      ...data.questionSettings,
    };
  }

  await db.collection(SURVEYS_COLLECTION).doc(surveyId).update(updates);

  logger.info('[updateSurvey] Updated survey:', surveyId, 'with updates:', JSON.stringify(updates));

  return {
    ...survey,
    ...updates,
  };
}

/**
 * Delete a survey
 */
export async function deleteSurvey(surveyId: string): Promise<boolean> {
  const db = getFirestoreAdmin();

  try {
    await db.collection(SURVEYS_COLLECTION).doc(surveyId).delete();
    logger.info('[deleteSurvey] Deleted survey:', surveyId);
    return true;
  } catch (error) {
    logger.error('[deleteSurvey] Error deleting survey:', surveyId, error);
    return false;
  }
}

/**
 * Get all surveys created by a user
 * REQUIRES Firestore composite index: creatorId + createdAt (desc)
 */
export async function getSurveysByCreator(creatorId: string): Promise<Survey[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEYS_COLLECTION)
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .get();

  const surveys = snapshot.docs.map((doc) => doc.data() as Survey);
  logger.info('[getSurveysByCreator] Found', surveys.length, 'surveys for creator:', creatorId);

  return surveys;
}

/**
 * Add a question to a survey
 */
export async function addQuestionToSurvey(
  surveyId: string,
  questionId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  // Don't add duplicate
  if (survey.questionIds.includes(questionId)) {
    logger.info('[addQuestionToSurvey] Question already in survey:', questionId);
    return survey;
  }

  const updatedQuestionIds = [...survey.questionIds, questionId];
  return updateSurvey(surveyId, { questionIds: updatedQuestionIds });
}

/**
 * Remove a question from a survey
 */
export async function removeQuestionFromSurvey(
  surveyId: string,
  questionId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const updatedQuestionIds = survey.questionIds.filter((id) => id !== questionId);
  return updateSurvey(surveyId, { questionIds: updatedQuestionIds });
}

/**
 * Reorder questions in a survey
 */
export async function reorderSurveyQuestions(
  surveyId: string,
  newOrder: string[]
): Promise<Survey | null> {
  return updateSurvey(surveyId, { questionIds: newOrder });
}

// ============================================
// SURVEY PROGRESS OPERATIONS
// ============================================

/**
 * Get user's progress for a survey
 */
export async function getSurveyProgress(
  surveyId: string,
  userId: string
): Promise<SurveyProgress | null> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);

  const doc = await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as SurveyProgress;
}

/**
 * Create or update user's survey progress
 */
export async function upsertSurveyProgress(
  surveyId: string,
  userId: string,
  updates: {
    currentQuestionIndex?: number;
    completedQuestionId?: string;
    isCompleted?: boolean;
  }
): Promise<SurveyProgress> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);
  const now = Date.now();

  const existingProgress = await getSurveyProgress(surveyId, userId);

  if (existingProgress) {
    // Update existing progress
    const progressUpdates: Partial<SurveyProgress> = {
      lastUpdated: now,
    };

    if (updates.currentQuestionIndex !== undefined) {
      progressUpdates.currentQuestionIndex = updates.currentQuestionIndex;
    }

    if (updates.completedQuestionId) {
      const completedIds = existingProgress.completedQuestionIds;
      if (!completedIds.includes(updates.completedQuestionId)) {
        progressUpdates.completedQuestionIds = [...completedIds, updates.completedQuestionId];
      }
    }

    if (updates.isCompleted !== undefined) {
      progressUpdates.isCompleted = updates.isCompleted;
    }

    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).update(progressUpdates);

    logger.info('[upsertSurveyProgress] Updated progress:', progressId);

    return {
      ...existingProgress,
      ...progressUpdates,
    };
  } else {
    // Create new progress
    const newProgress: SurveyProgress = {
      progressId,
      surveyId,
      userId,
      currentQuestionIndex: updates.currentQuestionIndex || 0,
      completedQuestionIds: updates.completedQuestionId ? [updates.completedQuestionId] : [],
      startedAt: now,
      lastUpdated: now,
      isCompleted: updates.isCompleted || false,
    };

    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).set(newProgress);

    logger.info('[upsertSurveyProgress] Created new progress:', progressId);

    return newProgress;
  }
}

// ============================================
// QUESTION FETCHING (from main Freedi app)
// ============================================

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

// ============================================
// SURVEY STATUS OPERATIONS
// ============================================

/**
 * Change survey status (draft -> active -> closed)
 */
export async function changeSurveyStatus(
  surveyId: string,
  newStatus: SurveyStatus
): Promise<Survey | null> {
  return updateSurvey(surveyId, { status: newStatus });
}

/**
 * Get survey statistics (response and completion counts)
 */
export async function getSurveyStats(surveyId: string): Promise<{
  responseCount: number;
  completionCount: number;
  completionRate: number;
}> {
  const db = getFirestoreAdmin();

  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const responseCount = progressSnapshot.size;
  const completionCount = progressSnapshot.docs.filter(
    (doc) => doc.data().isCompleted === true
  ).length;
  const completionRate = responseCount > 0 ? (completionCount / responseCount) * 100 : 0;

  return {
    responseCount,
    completionCount,
    completionRate: Math.round(completionRate),
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
