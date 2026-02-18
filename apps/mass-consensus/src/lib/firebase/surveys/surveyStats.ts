import { getFirestoreAdmin } from '../admin';
import { SURVEY_PROGRESS_COLLECTION } from './surveyHelpers';

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
