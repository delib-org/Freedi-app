import {
  Statement,
  StatementType,
  Collections,
  Role,
  SurveyLogo,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';
import {
  Survey,
  SurveyProgress,
  SurveyWithQuestions,
  CreateSurveyRequest,
  UpdateSurveyRequest,
  DEFAULT_SURVEY_SETTINGS,
  SurveyStatus,
  SurveyDemographicQuestion,
  SurveyDemographicAnswer,
} from '@/types/survey';
import {
  SurveyExportData,
  QuestionExportData,
  ExportStats,
} from '@/types/export';
import { getAllSolutionsSorted } from './queries';
import { logger } from '@/lib/utils/logger';

/** Collection name for surveys */
const SURVEYS_COLLECTION = 'surveys';
/** Collection name for survey progress */
const SURVEY_PROGRESS_COLLECTION = 'surveyProgress';
/** Collection name for survey demographic questions */
const SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION = 'surveyDemographicQuestions';
/** Collection name for survey demographic answers */
const SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION = 'surveyDemographicAnswers';

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 * Returns a new object with only defined values
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  return result;
}

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

  // Only add optional fields if they have values (Firestore doesn't accept undefined)
  if (data.defaultLanguage !== undefined) {
    survey.defaultLanguage = data.defaultLanguage;
  }
  if (data.forceLanguage !== undefined) {
    survey.forceLanguage = data.forceLanguage;
  }
  if (data.demographicPages !== undefined && data.demographicPages.length > 0) {
    survey.demographicPages = data.demographicPages;
  }
  if (data.explanationPages !== undefined && data.explanationPages.length > 0) {
    survey.explanationPages = data.explanationPages;
  }

  await db.collection(SURVEYS_COLLECTION).doc(survey.surveyId).set(survey);

  logger.info('[createSurvey] Created survey:', survey.surveyId,
    'questionSettings:', JSON.stringify(survey.questionSettings),
    'explanationPages:', survey.explanationPages?.length || 0,
    'demographicPages:', survey.demographicPages?.length || 0
  );
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
  if (data.defaultLanguage !== undefined) {
    updates.defaultLanguage = data.defaultLanguage;
  }
  if (data.forceLanguage !== undefined) {
    updates.forceLanguage = data.forceLanguage;
  }
  if (data.demographicPages !== undefined) {
    updates.demographicPages = data.demographicPages;
  }
  if (data.explanationPages !== undefined) {
    updates.explanationPages = data.explanationPages;
  }
  if (data.parentStatementId !== undefined) {
    updates.parentStatementId = data.parentStatementId;
  }
  if (data.isTestMode !== undefined) {
    updates.isTestMode = data.isTestMode;
  }
  if (data.showIntro !== undefined) {
    updates.showIntro = data.showIntro;
  }
  if (data.customIntroText !== undefined) {
    updates.customIntroText = data.customIntroText;
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
    /** Mark this progress as test data (set when survey is in test mode) */
    isTestData?: boolean;
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

    // Note: Don't update isTestData on existing progress - it was set when created

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

    // Set isTestData flag if provided (when survey is in test mode)
    if (updates.isTestData === true) {
      newProgress.isTestData = true;
    }

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

export interface SurveyStatsOptions {
  /** Include test data in stats (default: false) */
  includeTestData?: boolean;
}

export interface SurveyStatsResult {
  responseCount: number;
  completionCount: number;
  completionRate: number;
  /** Test response count (only returned if test data exists) */
  testResponseCount?: number;
  /** Test completion count (only returned if test data exists) */
  testCompletionCount?: number;
}

/**
 * Get stats for multiple surveys in a single batch query
 * Much more efficient than calling getSurveyStats for each survey individually
 */
export async function getBatchSurveyStats(
  surveyIds: string[],
  options: SurveyStatsOptions = {}
): Promise<Record<string, SurveyStatsResult>> {
  if (surveyIds.length === 0) return {};

  const { includeTestData = false } = options;
  const db = getFirestoreAdmin();
  const results: Record<string, SurveyStatsResult> = {};

  // Initialize empty results for all survey IDs
  for (const id of surveyIds) {
    results[id] = { responseCount: 0, completionCount: 0, completionRate: 0 };
  }

  // Firestore 'in' query limit is 30, so batch the queries
  const batchSize = 30;
  for (let i = 0; i < surveyIds.length; i += batchSize) {
    const batch = surveyIds.slice(i, i + batchSize);
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', 'in', batch)
      .get();

    // Group documents by surveyId
    for (const doc of progressSnapshot.docs) {
      const data = doc.data();
      const sid = data.surveyId as string;
      const isTest = data.isTestData === true;

      if (!includeTestData && isTest) continue;

      results[sid].responseCount++;
      if (data.isCompleted === true) {
        results[sid].completionCount++;
      }
    }
  }

  // Calculate completion rates
  for (const id of surveyIds) {
    const r = results[id];
    r.completionRate = r.responseCount > 0
      ? Math.round((r.completionCount / r.responseCount) * 100)
      : 0;
  }

  return results;
}

/**
 * Get survey statistics (response and completion counts)
 * By default, excludes test data from counts
 */
export async function getSurveyStats(
  surveyId: string,
  options: SurveyStatsOptions = {}
): Promise<SurveyStatsResult> {
  const { includeTestData = false } = options;
  const db = getFirestoreAdmin();

  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const allDocs = progressSnapshot.docs;

  // Separate test data from live data
  const liveDocs = allDocs.filter((doc) => doc.data().isTestData !== true);
  const testDocs = allDocs.filter((doc) => doc.data().isTestData === true);

  // Calculate live data stats
  const liveResponseCount = liveDocs.length;
  const liveCompletionCount = liveDocs.filter(
    (doc) => doc.data().isCompleted === true
  ).length;

  // Calculate test data stats
  const testResponseCount = testDocs.length;
  const testCompletionCount = testDocs.filter(
    (doc) => doc.data().isCompleted === true
  ).length;

  // Determine which counts to return based on includeTestData option
  const responseCount = includeTestData
    ? liveResponseCount + testResponseCount
    : liveResponseCount;
  const completionCount = includeTestData
    ? liveCompletionCount + testCompletionCount
    : liveCompletionCount;
  const completionRate = responseCount > 0 ? (completionCount / responseCount) * 100 : 0;

  const result: SurveyStatsResult = {
    responseCount,
    completionCount,
    completionRate: Math.round(completionRate),
  };

  // Include test data counts if there are any
  if (testResponseCount > 0) {
    result.testResponseCount = testResponseCount;
    result.testCompletionCount = testCompletionCount;
  }

  return result;
}

export interface TestDataCounts {
  progressCount: number;
  demographicAnswerCount: number;
  total: number;
}

/**
 * Get counts of test data for a survey
 */
export async function getTestDataCounts(surveyId: string): Promise<TestDataCounts> {
  const db = getFirestoreAdmin();

  // Count test progress documents
  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();
  const progressCount = progressSnapshot.size;

  // Count test demographic answers
  const answersSnapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();
  const demographicAnswerCount = answersSnapshot.size;

  return {
    progressCount,
    demographicAnswerCount,
    total: progressCount + demographicAnswerCount,
  };
}

export interface ClearTestDataResult {
  success: boolean;
  deletedCounts: TestDataCounts;
}

/**
 * Clear all test data for a survey
 * Deletes progress documents and demographic answers marked as test data
 */
export async function clearSurveyTestData(surveyId: string): Promise<ClearTestDataResult> {
  const db = getFirestoreAdmin();
  const deletedCounts: TestDataCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    total: 0,
  };

  try {
    // Get and delete test progress documents
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    // Get and delete test demographic answers
    const answersSnapshot = await db
      .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    // Batch delete (Firestore batch limit is 500)
    const BATCH_SIZE = 500;
    const allDocs = [...progressSnapshot.docs, ...answersSnapshot.docs];

    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const doc of batchDocs) {
        batch.delete(doc.ref);
      }

      await batch.commit();
    }

    deletedCounts.progressCount = progressSnapshot.size;
    deletedCounts.demographicAnswerCount = answersSnapshot.size;
    deletedCounts.total = deletedCounts.progressCount + deletedCounts.demographicAnswerCount;

    logger.info(
      '[clearSurveyTestData] Cleared test data for survey:',
      surveyId,
      'deleted:',
      deletedCounts.total
    );

    return { success: true, deletedCounts };
  } catch (error) {
    logger.error('[clearSurveyTestData] Error clearing test data:', surveyId, error);
    return { success: false, deletedCounts };
  }
}

export interface MarkAllAsTestDataResult {
  success: boolean;
  markedCounts: {
    progressCount: number;
    demographicAnswerCount: number;
    evaluationCount: number;
    userEvaluationCount: number;
    total: number;
  };
  markedAt: number;
}

/**
 * Mark all existing live data (progress, demographics, evaluations) as test/pilot data
 * This is useful when admin wants to mark all data collected up to now as pilot data
 * and start fresh for real data collection
 */
export async function markAllDataAsTestData(
  surveyId: string,
  questionIds: string[]
): Promise<MarkAllAsTestDataResult> {
  const db = getFirestoreAdmin();
  const markedAt = Date.now();
  const markedCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    evaluationCount: 0,
    userEvaluationCount: 0,
    total: 0,
  };

  try {
    const BATCH_SIZE = 500;

    // 1. Mark all progress documents that are NOT already test data
    // Note: We query all and filter client-side because Firestore != queries
    // don't include documents where the field doesn't exist
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .get();

    // Filter out documents that already have isTestData=true
    const progressDocs = progressSnapshot.docs.filter(
      (doc) => doc.data().isTestData !== true
    );

    // 2. Mark all demographic answers that are NOT already test data
    const answersSnapshot = await db
      .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .get();

    const answerDocs = answersSnapshot.docs.filter(
      (doc) => doc.data().isTestData !== true
    );

    // 3. Mark all evaluations for this survey's questions
    const evaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const userEvaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    // Get evaluations and userEvaluations for each question in the survey
    for (const questionId of questionIds) {
      // Get evaluations where parentId matches (evaluations of solutions under this question)
      const evalSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .get();

      const filteredEvalDocs = evalSnapshot.docs.filter(
        (doc) => doc.data().isTestData !== true
      );
      evaluationDocs.push(...filteredEvalDocs);

      // Get userEvaluations for this question
      const userEvalSnapshot = await db
        .collection(Collections.userEvaluations)
        .where('parentStatementId', '==', questionId)
        .get();

      const filteredUserEvalDocs = userEvalSnapshot.docs.filter(
        (doc) => doc.data().isTestData !== true
      );
      userEvaluationDocs.push(...filteredUserEvalDocs);
    }

    // Combine all documents to update
    const allDocs = [
      ...progressDocs.map((doc) => ({ ref: doc.ref, type: 'progress' })),
      ...answerDocs.map((doc) => ({ ref: doc.ref, type: 'demographic' })),
      ...evaluationDocs.map((doc) => ({ ref: doc.ref, type: 'evaluation' })),
      ...userEvaluationDocs.map((doc) => ({ ref: doc.ref, type: 'userEvaluation' })),
    ];

    // Batch update all documents
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const { ref } of batchDocs) {
        batch.update(ref, {
          isTestData: true,
          markedAsTestAt: markedAt,
        });
      }

      await batch.commit();
    }

    // Count by type
    markedCounts.progressCount = progressDocs.length;
    markedCounts.demographicAnswerCount = answerDocs.length;
    markedCounts.evaluationCount = evaluationDocs.length;
    markedCounts.userEvaluationCount = userEvaluationDocs.length;
    markedCounts.total =
      markedCounts.progressCount +
      markedCounts.demographicAnswerCount +
      markedCounts.evaluationCount +
      markedCounts.userEvaluationCount;

    logger.info(
      '[markAllDataAsTestData] Marked data as test for survey:',
      surveyId,
      'counts:',
      markedCounts
    );

    return { success: true, markedCounts, markedAt };
  } catch (error) {
    logger.error('[markAllDataAsTestData] Error marking data as test:', surveyId, error);
    return { success: false, markedCounts, markedAt };
  }
}

export interface UnmarkTestDataResult {
  success: boolean;
  unmarkedCounts: {
    progressCount: number;
    demographicAnswerCount: number;
    evaluationCount: number;
    userEvaluationCount: number;
    total: number;
  };
}

/**
 * Unmark data that was retroactively marked as test data (has markedAsTestAt field)
 * This reverses the markAllDataAsTestData operation
 * Note: Only unmarks data that was RETROACTIVELY marked (has markedAsTestAt),
 * not data that was collected while test mode was ON
 */
export async function unmarkRetroactiveTestData(
  surveyId: string,
  questionIds: string[]
): Promise<UnmarkTestDataResult> {
  const db = getFirestoreAdmin();
  const unmarkedCounts = {
    progressCount: 0,
    demographicAnswerCount: 0,
    evaluationCount: 0,
    userEvaluationCount: 0,
    total: 0,
  };

  try {
    const BATCH_SIZE = 500;

    // 1. Find progress documents that were retroactively marked (have markedAsTestAt)
    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    const progressDocs = progressSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    );

    // 2. Find demographic answers that were retroactively marked
    const answersSnapshot = await db
      .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('isTestData', '==', true)
      .get();

    const answerDocs = answersSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    );

    // 3. Find evaluations and userEvaluations that were retroactively marked
    const evaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];
    const userEvaluationDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    for (const questionId of questionIds) {
      const evalSnapshot = await db
        .collection(Collections.evaluations)
        .where('parentId', '==', questionId)
        .where('isTestData', '==', true)
        .get();

      const filteredEvalDocs = evalSnapshot.docs.filter(
        (doc) => doc.data().markedAsTestAt !== undefined
      );
      evaluationDocs.push(...filteredEvalDocs);

      const userEvalSnapshot = await db
        .collection(Collections.userEvaluations)
        .where('parentStatementId', '==', questionId)
        .where('isTestData', '==', true)
        .get();

      const filteredUserEvalDocs = userEvalSnapshot.docs.filter(
        (doc) => doc.data().markedAsTestAt !== undefined
      );
      userEvaluationDocs.push(...filteredUserEvalDocs);
    }

    // Combine all documents to update
    const allDocs = [
      ...progressDocs.map((doc) => ({ ref: doc.ref, type: 'progress' })),
      ...answerDocs.map((doc) => ({ ref: doc.ref, type: 'demographic' })),
      ...evaluationDocs.map((doc) => ({ ref: doc.ref, type: 'evaluation' })),
      ...userEvaluationDocs.map((doc) => ({ ref: doc.ref, type: 'userEvaluation' })),
    ];

    // Batch update - remove isTestData and markedAsTestAt using FieldValue.delete()
    const { FieldValue } = await import('firebase-admin/firestore');

    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = allDocs.slice(i, i + BATCH_SIZE);

      for (const { ref } of batchDocs) {
        batch.update(ref, {
          isTestData: FieldValue.delete(),
          markedAsTestAt: FieldValue.delete(),
        });
      }

      await batch.commit();
    }

    // Count by type
    unmarkedCounts.progressCount = progressDocs.length;
    unmarkedCounts.demographicAnswerCount = answerDocs.length;
    unmarkedCounts.evaluationCount = evaluationDocs.length;
    unmarkedCounts.userEvaluationCount = userEvaluationDocs.length;
    unmarkedCounts.total =
      unmarkedCounts.progressCount +
      unmarkedCounts.demographicAnswerCount +
      unmarkedCounts.evaluationCount +
      unmarkedCounts.userEvaluationCount;

    logger.info(
      '[unmarkRetroactiveTestData] Unmarked retroactive test data for survey:',
      surveyId,
      'counts:',
      unmarkedCounts
    );

    return { success: true, unmarkedCounts };
  } catch (error) {
    logger.error('[unmarkRetroactiveTestData] Error unmarking test data:', surveyId, error);
    return { success: false, unmarkedCounts };
  }
}

/**
 * Get counts of data that was retroactively marked as pilot (has markedAsTestAt)
 */
export async function getRetroactiveTestDataCounts(
  surveyId: string,
  questionIds: string[]
): Promise<{
  progressCount: number;
  demographicAnswerCount: number;
  evaluationCount: number;
  userEvaluationCount: number;
  total: number;
}> {
  const db = getFirestoreAdmin();

  // Count progress documents with markedAsTestAt
  const progressSnapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();

  const progressCount = progressSnapshot.docs.filter(
    (doc) => doc.data().markedAsTestAt !== undefined
  ).length;

  // Count demographic answers with markedAsTestAt
  const answersSnapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('isTestData', '==', true)
    .get();

  const demographicAnswerCount = answersSnapshot.docs.filter(
    (doc) => doc.data().markedAsTestAt !== undefined
  ).length;

  // Count evaluations and userEvaluations with markedAsTestAt
  let evaluationCount = 0;
  let userEvaluationCount = 0;

  for (const questionId of questionIds) {
    const evalSnapshot = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', questionId)
      .where('isTestData', '==', true)
      .get();

    evaluationCount += evalSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    ).length;

    const userEvalSnapshot = await db
      .collection(Collections.userEvaluations)
      .where('parentStatementId', '==', questionId)
      .where('isTestData', '==', true)
      .get();

    userEvaluationCount += userEvalSnapshot.docs.filter(
      (doc) => doc.data().markedAsTestAt !== undefined
    ).length;
  }

  return {
    progressCount,
    demographicAnswerCount,
    evaluationCount,
    userEvaluationCount,
    total: progressCount + demographicAnswerCount + evaluationCount + userEvaluationCount,
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

// ============================================
// SURVEY DEMOGRAPHIC OPERATIONS
// ============================================

/**
 * Generate a unique demographic question ID
 */
function generateDemographicQuestionId(): string {
  return `demq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate demographic answer ID
 */
function generateDemographicAnswerId(surveyId: string, userId: string, questionId: string): string {
  return `${surveyId}--${userId}--${questionId}`;
}

/**
 * Get demographic questions by their IDs
 */
export async function getSurveyDemographicQuestions(
  surveyId: string,
  questionIds: string[]
): Promise<SurveyDemographicQuestion[]> {
  if (!questionIds || questionIds.length === 0) {
    return [];
  }

  const db = getFirestoreAdmin();
  const questions: SurveyDemographicQuestion[] = [];

  // Firestore 'in' query limit is 30
  const batchSize = 30;

  for (let i = 0; i < questionIds.length; i += batchSize) {
    const batch = questionIds.slice(i, i + batchSize);
    const snapshot = await db
      .collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION)
      .where('questionId', 'in', batch)
      .get();

    const batchQuestions = snapshot.docs.map((doc) => doc.data() as SurveyDemographicQuestion);
    questions.push(...batchQuestions);
  }

  // Sort by order field
  questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  logger.info(
    '[getSurveyDemographicQuestions] Found',
    questions.length,
    'demographic questions for survey:',
    surveyId
  );

  return questions;
}

/**
 * Get all demographic questions for a survey
 * Note: Sorting done client-side to avoid requiring composite index
 */
export async function getAllSurveyDemographicQuestions(
  surveyId: string
): Promise<SurveyDemographicQuestion[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const questions = snapshot.docs.map((doc) => doc.data() as SurveyDemographicQuestion);

  // Sort by order field client-side (avoids needing composite index)
  questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  logger.info(
    '[getAllSurveyDemographicQuestions] Found',
    questions.length,
    'demographic questions for survey:',
    surveyId
  );

  return questions;
}

/**
 * Create a new demographic question
 */
export async function createSurveyDemographicQuestion(
  surveyId: string,
  data: Omit<SurveyDemographicQuestion, 'questionId' | 'surveyId' | 'createdAt' | 'lastUpdate'>
): Promise<SurveyDemographicQuestion> {
  const db = getFirestoreAdmin();
  const now = Date.now();

  const question: SurveyDemographicQuestion = stripUndefined({
    questionId: generateDemographicQuestionId(),
    surveyId,
    createdAt: now,
    lastUpdate: now,
    ...data,
  });

  await db
    .collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(question.questionId)
    .set(question);

  logger.info(
    '[createSurveyDemographicQuestion] Created demographic question:',
    question.questionId,
    'for survey:',
    surveyId
  );

  return question;
}

/**
 * Update a demographic question
 */
export async function updateSurveyDemographicQuestion(
  questionId: string,
  updates: Partial<Omit<SurveyDemographicQuestion, 'questionId' | 'surveyId'>>
): Promise<SurveyDemographicQuestion | null> {
  const db = getFirestoreAdmin();

  const doc = await db
    .collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(questionId)
    .get();

  if (!doc.exists) {
    logger.info('[updateSurveyDemographicQuestion] Question not found:', questionId);
    return null;
  }

  // Strip undefined values (Firestore doesn't accept undefined)
  const cleanUpdates = stripUndefined(updates as Record<string, unknown>);
  await db.collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(questionId).update(cleanUpdates);

  const updatedDoc = await db
    .collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION)
    .doc(questionId)
    .get();

  return updatedDoc.data() as SurveyDemographicQuestion;
}

/**
 * Delete a demographic question
 */
export async function deleteSurveyDemographicQuestion(questionId: string): Promise<boolean> {
  const db = getFirestoreAdmin();

  try {
    await db.collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(questionId).delete();
    logger.info('[deleteSurveyDemographicQuestion] Deleted question:', questionId);
    return true;
  } catch (error) {
    logger.error('[deleteSurveyDemographicQuestion] Error deleting question:', questionId, error);
    return false;
  }
}

interface BatchQuestionData {
  questionId?: string;
  tempId?: string;
  question: string;
  type: SurveyDemographicQuestion['type'];
  options?: SurveyDemographicQuestion['options'];
  order?: number;
  required?: boolean;
  // Range-specific fields
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
}

interface BatchSaveResult {
  savedQuestions: SurveyDemographicQuestion[];
  idMapping: Record<string, string>;
}

/**
 * Batch save demographic questions (create or update) in a single Firestore batch
 * Much more efficient than individual operations
 */
export async function batchSaveDemographicQuestions(
  surveyId: string,
  questions: BatchQuestionData[]
): Promise<BatchSaveResult> {
  const db = getFirestoreAdmin();
  const now = Date.now();
  const batch = db.batch();
  const savedQuestions: SurveyDemographicQuestion[] = [];
  const idMapping: Record<string, string> = {};

  for (const questionData of questions) {
    const isNew = !questionData.questionId || questionData.questionId.startsWith('demo-q-');
    const questionId: string = isNew ? generateDemographicQuestionId() : questionData.questionId!;

    const question: SurveyDemographicQuestion = stripUndefined({
      questionId,
      surveyId,
      question: questionData.question,
      type: questionData.type,
      options: questionData.options,
      order: questionData.order ?? 0,
      required: questionData.required ?? false,
      // Range-specific fields
      min: questionData.min,
      max: questionData.max,
      step: questionData.step,
      minLabel: questionData.minLabel,
      maxLabel: questionData.maxLabel,
      createdAt: now,
      lastUpdate: now,
    });

    const docRef = db.collection(SURVEY_DEMOGRAPHIC_QUESTIONS_COLLECTION).doc(questionId);

    if (isNew) {
      batch.set(docRef, question);
      // Track temp ID mapping
      const tempId = questionData.tempId || questionData.questionId;
      if (tempId) {
        idMapping[tempId] = questionId;
      }
    } else {
      // For updates, use set with merge to preserve createdAt
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { createdAt: _, ...updateData } = question;
      batch.set(docRef, updateData, { merge: true });
    }

    savedQuestions.push(question);
  }

  await batch.commit();

  logger.info(
    '[batchSaveDemographicQuestions] Saved',
    savedQuestions.length,
    'questions for survey:',
    surveyId
  );

  return { savedQuestions, idMapping };
}

export interface SaveDemographicAnswersOptions {
  /** Mark answers as test data (set when survey is in test mode) */
  isTestData?: boolean;
}

/**
 * Save demographic answers for a user
 */
export async function saveSurveyDemographicAnswers(
  surveyId: string,
  userId: string,
  answers: Array<{
    questionId: string;
    answer?: string;
    answerOptions?: string[];
  }>,
  options: SaveDemographicAnswersOptions = {}
): Promise<SurveyDemographicAnswer[]> {
  const db = getFirestoreAdmin();
  const now = Date.now();
  const savedAnswers: SurveyDemographicAnswer[] = [];

  const batch = db.batch();

  for (const answerData of answers) {
    const answerId = generateDemographicAnswerId(surveyId, userId, answerData.questionId);

    // Strip undefined values (Firestore doesn't accept undefined)
    const answer: SurveyDemographicAnswer = stripUndefined({
      answerId,
      surveyId,
      userId,
      questionId: answerData.questionId,
      answer: answerData.answer,
      answerOptions: answerData.answerOptions,
      isTestData: options.isTestData === true ? true : undefined,
      createdAt: now,
      lastUpdate: now,
    });

    const docRef = db.collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION).doc(answerId);
    batch.set(docRef, answer, { merge: true });
    savedAnswers.push(answer);
  }

  await batch.commit();

  logger.info(
    '[saveSurveyDemographicAnswers] Saved',
    savedAnswers.length,
    'answers for user:',
    userId,
    'survey:',
    surveyId,
    options.isTestData ? '(test data)' : ''
  );

  return savedAnswers;
}

/**
 * Get demographic answers for a user in a survey
 */
export async function getSurveyDemographicAnswers(
  surveyId: string,
  userId: string
): Promise<SurveyDemographicAnswer[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .where('userId', '==', userId)
    .get();

  const answers = snapshot.docs.map((doc) => doc.data() as SurveyDemographicAnswer);

  logger.info(
    '[getSurveyDemographicAnswers] Found',
    answers.length,
    'answers for user:',
    userId,
    'survey:',
    surveyId
  );

  return answers;
}

/**
 * Get all demographic answers for a survey (admin use)
 */
export async function getAllSurveyDemographicAnswers(
  surveyId: string
): Promise<SurveyDemographicAnswer[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const answers = snapshot.docs.map((doc) => doc.data() as SurveyDemographicAnswer);

  logger.info(
    '[getAllSurveyDemographicAnswers] Found',
    answers.length,
    'total answers for survey:',
    surveyId
  );

  return answers;
}

/**
 * Get all survey progress records for a survey (admin use)
 */
export async function getAllSurveyProgress(
  surveyId: string
): Promise<SurveyProgress[]> {
  const db = getFirestoreAdmin();

  const snapshot = await db
    .collection(SURVEY_PROGRESS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  const progress = snapshot.docs.map((doc) => doc.data() as SurveyProgress);

  logger.info(
    '[getAllSurveyProgress] Found',
    progress.length,
    'progress records for survey:',
    surveyId
  );

  return progress;
}

// ============================================
// OPENING SLIDE & LOGO OPERATIONS
// ============================================

/**
 * Update survey opening slide content and visibility
 */
export async function updateSurveyOpeningSlide(
  surveyId: string,
  content: string,
  show: boolean
): Promise<Survey | null> {
  return updateSurvey(surveyId, {
    openingSlideContent: content,
    showOpeningSlide: show,
  });
}

/**
 * Add a logo to survey
 */
export async function addLogoToSurvey(
  surveyId: string,
  logo: SurveyLogo
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = [...currentLogos, logo];

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Remove a logo from survey
 */
export async function removeLogoFromSurvey(
  surveyId: string,
  logoId: string
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.filter((logo) => logo.logoId !== logoId);

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Update logo metadata (alt text, order, dimensions)
 */
export async function updateLogoInSurvey(
  surveyId: string,
  logoId: string,
  updates: {
    altText?: string;
    order?: number;
    width?: number;
    height?: number;
  }
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.map((logo) => {
    if (logo.logoId === logoId) {
      return {
        ...logo,
        ...(updates.altText !== undefined && { altText: updates.altText }),
        ...(updates.order !== undefined && { order: updates.order }),
        ...(updates.width !== undefined && { width: updates.width }),
        ...(updates.height !== undefined && { height: updates.height }),
      };
    }
    return logo;
  });

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Reorder logos in survey
 */
export async function reorderSurveyLogos(
  surveyId: string,
  logoOrder: string[]
): Promise<Survey | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    return null;
  }

  const currentLogos = survey.logos || [];
  const updatedLogos = currentLogos.map((logo) => {
    const newOrder = logoOrder.indexOf(logo.logoId);
    return {
      ...logo,
      order: newOrder >= 0 ? newOrder : logo.order,
    };
  });

  // Sort by new order
  updatedLogos.sort((a, b) => a.order - b.order);

  return updateSurvey(surveyId, { logos: updatedLogos });
}

/**
 * Mark opening slide as viewed for a user
 */
export async function markOpeningSlideViewed(
  surveyId: string,
  userId: string
): Promise<SurveyProgress> {
  const db = getFirestoreAdmin();
  const progressId = generateProgressId(surveyId, userId);

  const existingProgress = await getSurveyProgress(surveyId, userId);

  if (existingProgress) {
    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).update({
      hasViewedOpeningSlide: true,
      lastUpdated: Date.now(),
    });

    return {
      ...existingProgress,
      hasViewedOpeningSlide: true,
      lastUpdated: Date.now(),
    };
  } else {
    // Create new progress with opening slide viewed
    const now = Date.now();
    const newProgress: SurveyProgress = {
      progressId,
      surveyId,
      userId,
      currentQuestionIndex: 0,
      completedQuestionIds: [],
      startedAt: now,
      lastUpdated: now,
      isCompleted: false,
      hasViewedOpeningSlide: true,
    };

    await db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId).set(newProgress);

    return newProgress;
  }
}

// ============================================
// SURVEY EXPORT OPERATIONS
// ============================================

export interface GetSurveyExportDataOptions {
  /** Include test data in the export (default: false) */
  includeTestData?: boolean;
}

/**
 * Get complete survey data for export
 * Fetches all survey data including questions, options, responses, and demographics
 */
export async function getSurveyExportData(
  surveyId: string,
  options: GetSurveyExportDataOptions = {}
): Promise<SurveyExportData | null> {
  const { includeTestData = false } = options;
  const db = getFirestoreAdmin();

  logger.info('[getSurveyExportData] Starting export for survey:', surveyId, 'includeTestData:', includeTestData);

  // 1. Get survey configuration
  const survey = await getSurveyById(surveyId);
  if (!survey) {
    logger.error('[getSurveyExportData] Survey not found:', surveyId);
    return null;
  }

  // 2. Fetch all questions
  const questions: QuestionExportData[] = [];
  for (const questionId of survey.questionIds) {
    const questionDoc = await db.collection(Collections.statements).doc(questionId).get();
    if (questionDoc.exists) {
      const question = questionDoc.data() as Statement;
      // Get all options for this question, sorted by consensus
      const optionsData = await getAllSolutionsSorted(questionId, 1000);
      questions.push({
        question,
        options: optionsData,
        optionCount: optionsData.length,
      });
    }
  }

  // 3. Get demographic questions
  const demographicQuestions = await getAllSurveyDemographicQuestions(surveyId);

  // 4. Get all progress records
  const allProgress = await getAllSurveyProgress(surveyId);
  const filteredProgress = includeTestData
    ? allProgress
    : allProgress.filter((p) => p.isTestData !== true);

  // 5. Get all demographic answers
  const allAnswers = await getAllSurveyDemographicAnswers(surveyId);
  const filteredAnswers = includeTestData
    ? allAnswers
    : allAnswers.filter((a) => a.isTestData !== true);

  // 6. Calculate stats
  const totalResponses = filteredProgress.length;
  const completedResponses = filteredProgress.filter((p) => p.isCompleted === true).length;
  const completionRate = totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0;

  const stats: ExportStats = {
    totalResponses,
    completedResponses,
    completionRate,
  };

  logger.info('[getSurveyExportData] Export complete:', {
    surveyId,
    questionCount: questions.length,
    demographicQuestionCount: demographicQuestions.length,
    progressCount: filteredProgress.length,
    answersCount: filteredAnswers.length,
  });

  return {
    exportedAt: Date.now(),
    includesTestData: includeTestData,
    survey,
    questions,
    demographicQuestions,
    responses: {
      progress: filteredProgress,
      demographicAnswers: filteredAnswers,
    },
    stats,
  };
}
