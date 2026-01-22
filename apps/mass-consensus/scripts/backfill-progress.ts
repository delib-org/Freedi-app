/**
 * One-time migration script to backfill surveyProgress records
 * for users who have demographic answers but no progress records.
 *
 * This fixes historical data where progress tracking failed due to
 * missing `credentials: 'include'` in fetch calls.
 *
 * Usage:
 *   npx tsx scripts/backfill-progress.ts [surveyId]
 *
 * If no surveyId is provided, it will process all surveys.
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !match[1].startsWith('#')) {
      const key = match[1].trim();
      let value = match[2].trim();
      value = value.replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
} catch (error) {
  console.error('Failed to load .env file:', error);
  process.exit(1);
}

// Import Firebase after env is loaded - use require to avoid top-level await
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

interface DemographicAnswer {
  answerId: string;
  surveyId: string;
  userId: string;
  questionId: string;
  answer?: string;
  answerOptions?: string[];
  isTestData?: boolean;
  createdAt: number;
  lastUpdate: number;
}

interface SurveyProgress {
  progressId: string;
  surveyId: string;
  userId: string;
  currentQuestionIndex: number;
  completedQuestionIds: string[];
  startedAt: number;
  lastUpdated: number;
  isCompleted: boolean;
  isTestData?: boolean;
}

interface Survey {
  surveyId: string;
  questionIds: string[];
  isTestMode?: boolean;
}

interface BackfillResult {
  surveyId: string;
  usersProcessed: number;
  progressCreated: number;
  skipped: number;
  errors: number;
}

const SURVEY_PROGRESS_COLLECTION = 'surveyProgress';
const SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION = 'surveyDemographicAnswers';
const SURVEYS_COLLECTION = 'surveys';

/**
 * Generate progress document ID (same format as the app uses)
 */
function generateProgressId(surveyId: string, userId: string): string {
  return `${surveyId}--${userId}`;
}

/**
 * Backfill progress records for a single survey
 */
async function backfillSurveyProgress(surveyId: string): Promise<BackfillResult> {
  const db = getFirestoreAdmin();
  const result: BackfillResult = {
    surveyId,
    usersProcessed: 0,
    progressCreated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log(`\n📊 Processing survey: ${surveyId}`);

  // 1. Get survey info
  const surveyDoc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!surveyDoc.exists) {
    console.log(`  ⚠️  Survey not found, skipping`);
    return result;
  }
  const survey = surveyDoc.data() as Survey;

  // 2. Get all demographic answers for this survey
  const answersSnapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .where('surveyId', '==', surveyId)
    .get();

  if (answersSnapshot.empty) {
    console.log(`  ℹ️  No demographic answers found`);
    return result;
  }

  // 3. Group answers by userId and find earliest/latest timestamps
  const userDataMap = new Map<string, {
    earliestCreatedAt: number;
    latestUpdate: number;
    isTestData: boolean;
    answerCount: number;
  }>();

  answersSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
    const answer = doc.data() as DemographicAnswer;
    const existing = userDataMap.get(answer.userId);

    if (existing) {
      existing.earliestCreatedAt = Math.min(existing.earliestCreatedAt, answer.createdAt);
      existing.latestUpdate = Math.max(existing.latestUpdate, answer.lastUpdate || answer.createdAt);
      existing.answerCount++;
      // If any answer is test data, mark the user's progress as test data
      if (answer.isTestData) {
        existing.isTestData = true;
      }
    } else {
      userDataMap.set(answer.userId, {
        earliestCreatedAt: answer.createdAt,
        latestUpdate: answer.lastUpdate || answer.createdAt,
        isTestData: answer.isTestData === true,
        answerCount: 1,
      });
    }
  });

  console.log(`  Found ${userDataMap.size} unique users with demographic answers`);

  // 4. Check which users already have progress records
  const userIds = Array.from(userDataMap.keys());
  const existingProgressIds = new Set<string>();

  // Query in batches (Firestore 'in' limit is 30)
  const batchSize = 30;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const progressIds = batch.map(userId => generateProgressId(surveyId, userId));

    const progressSnapshot = await db
      .collection(SURVEY_PROGRESS_COLLECTION)
      .where('progressId', 'in', progressIds)
      .get();

    progressSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
      existingProgressIds.add(doc.id);
    });
  }

  console.log(`  ${existingProgressIds.size} users already have progress records`);

  // 5. Create progress records for users who don't have them
  const WRITE_BATCH_SIZE = 500;
  let batch = db.batch();
  let batchCount = 0;

  for (const [userId, userData] of userDataMap) {
    result.usersProcessed++;
    const progressId = generateProgressId(surveyId, userId);

    if (existingProgressIds.has(progressId)) {
      result.skipped++;
      continue;
    }

    try {
      const progress: SurveyProgress = {
        progressId,
        surveyId,
        userId,
        currentQuestionIndex: survey.questionIds.length, // Assume they completed all questions
        completedQuestionIds: survey.questionIds, // Assume all questions completed
        startedAt: userData.earliestCreatedAt,
        lastUpdated: userData.latestUpdate,
        isCompleted: true, // Assume completed since they have demographic answers
      };

      // Preserve test data flag
      if (userData.isTestData) {
        progress.isTestData = true;
      }

      const docRef = db.collection(SURVEY_PROGRESS_COLLECTION).doc(progressId);
      batch.set(docRef, progress);
      batchCount++;
      result.progressCreated++;

      // Commit batch if we've reached the limit
      if (batchCount >= WRITE_BATCH_SIZE) {
        await batch.commit();
        console.log(`  ✅ Committed batch of ${batchCount} progress records`);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (error) {
      console.error(`  ❌ Error creating progress for user ${userId}:`, error);
      result.errors++;
    }
  }

  // Commit any remaining records
  if (batchCount > 0) {
    await batch.commit();
    console.log(`  ✅ Committed final batch of ${batchCount} progress records`);
  }

  console.log(`  Summary: ${result.progressCreated} created, ${result.skipped} skipped, ${result.errors} errors`);

  return result;
}

/**
 * Get all survey IDs that have demographic answers
 */
async function getSurveyIdsWithDemographicAnswers(): Promise<string[]> {
  const db = getFirestoreAdmin();

  // Get distinct surveyIds from demographic answers
  // Since Firestore doesn't support DISTINCT, we'll query all and dedupe
  const snapshot = await db
    .collection(SURVEY_DEMOGRAPHIC_ANSWERS_COLLECTION)
    .select('surveyId')
    .get();

  const surveyIds = new Set<string>();
  snapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
    const data = doc.data();
    if (data.surveyId) {
      surveyIds.add(data.surveyId);
    }
  });

  return Array.from(surveyIds);
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting survey progress backfill migration\n');

  const specificSurveyId = process.argv[2];
  let surveyIds: string[];

  if (specificSurveyId) {
    console.log(`Processing specific survey: ${specificSurveyId}`);
    surveyIds = [specificSurveyId];
  } else {
    console.log('No survey ID provided, fetching all surveys with demographic answers...');
    surveyIds = await getSurveyIdsWithDemographicAnswers();
    console.log(`Found ${surveyIds.length} surveys to process`);
  }

  const results: BackfillResult[] = [];

  for (const surveyId of surveyIds) {
    const result = await backfillSurveyProgress(surveyId);
    results.push(result);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(60));

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const result of results) {
    console.log(`\n${result.surveyId}:`);
    console.log(`  Users processed: ${result.usersProcessed}`);
    console.log(`  Progress created: ${result.progressCreated}`);
    console.log(`  Skipped (already existed): ${result.skipped}`);
    console.log(`  Errors: ${result.errors}`);

    totalCreated += result.progressCreated;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`TOTAL: ${totalCreated} progress records created, ${totalSkipped} skipped, ${totalErrors} errors`);
  console.log('='.repeat(60));

  if (totalErrors > 0) {
    console.log('\n⚠️  Some errors occurred. Check the logs above for details.');
    process.exit(1);
  }

  console.log('\n✅ Migration completed successfully!');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
