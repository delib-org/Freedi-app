/**
 * One-off backfill: stamp `demographicAnchorId` onto existing evaluations
 * belonging to a specific survey, so the polarization index can resolve
 * each evaluator's demographic answers via a direct anchor lookup.
 *
 * WHY THIS IS NEEDED
 * Evaluations created before the "evaluation carries demographic anchor"
 * change have no pointer back to the survey they were submitted in. For
 * surveys whose picked questions are not structurally nested under the
 * survey's demographic anchor, `fn_polarizationIndex`'s ancestor walk
 * never reaches the demographic folder — so polarization sees zero
 * demographics. This script retroactively links the evaluations so the
 * Firestore `onUpdate` trigger re-runs `updateUserDemographicEvaluation`
 * with the anchor, rewriting each question's polarization snapshot.
 *
 * SAFETY
 *   - Scoped: only touches evaluations by users who actually have
 *     demographic answers stored under this survey's anchor.
 *   - Idempotent: evaluations that already carry `demographicAnchorId`
 *     are skipped (matching anchors are left alone; mismatching anchors
 *     are logged and left alone — never overwritten).
 *   - Dry-run by default? No — pass `--dry-run` to preview. Run dry
 *     first, review the counts, then run for real.
 *
 * USAGE
 *   npx tsx scripts/backfill-survey-demographic-anchor.ts <surveyId> [--dry-run]
 *
 * DEPLOY ORDER
 *   Deploy functions (with the updated onCreateEvaluation /
 *   onUpdateEvaluation / fn_polarizationIndex) BEFORE running this
 *   script. The script writes to evaluation docs; the onUpdate trigger
 *   then re-runs polarization with the new anchor. If the old functions
 *   are still deployed, the anchor field is written but no recompute
 *   happens until the new functions are live.
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot, WriteBatch } from 'firebase-admin/firestore';

// Load env file BEFORE requiring firebase-admin wrapper.
// Defaults to apps/mass-consensus/.env (local/emulator). Override with
// ENV_FILE=/path/to/.env.prod to target production.
const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !match[1].startsWith('#')) {
      const key = match[1].trim();
      let value = match[2].trim();
      value = value.replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
  console.log(`[env] Loaded ${envPath}`);
  console.log(
    `[env] FIREBASE_PROJECT_ID=${process.env.FIREBASE_PROJECT_ID} USE_FIREBASE_EMULATOR=${process.env.USE_FIREBASE_EMULATOR}`,
  );
} catch (error) {
  console.error(`Failed to load env file at ${envPath}:`, error);
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

const SURVEYS_COLLECTION = 'surveys';
const EVALUATIONS_COLLECTION = 'evaluations';
const USERS_DATA_COLLECTION = 'usersData';
const FIRESTORE_BATCH_SIZE = 400; // leave headroom under the 500 limit

interface Survey {
  surveyId: string;
  questionIds: string[];
  parentStatementId?: string;
}

interface BackfillSummary {
  surveyId: string;
  anchorId: string;
  usersWithDemographics: number;
  questionsProcessed: number;
  evaluationsScanned: number;
  evaluationsStamped: number;
  alreadyStamped: number;
  mismatchedAnchor: number;
  outOfScope: number;
}

/**
 * Compute the demographic anchor for a survey. Mirrors
 * `getStatementIdForSurvey` from
 * apps/mass-consensus/src/lib/firebase/surveys/surveyHelpers.ts —
 * kept inline to avoid importing app code that pulls in Next.js.
 */
function getSurveyAnchor(survey: Survey): string {
  if (survey.parentStatementId) return survey.parentStatementId;

  return survey.surveyId;
}

async function fetchUsersWithDemographicsForAnchor(
  db: FirebaseFirestore.Firestore,
  anchorId: string,
): Promise<Set<string>> {
  const snapshot = await db
    .collection(USERS_DATA_COLLECTION)
    .where('statementId', '==', anchorId)
    .get();

  const users = new Set<string>();
  snapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
    const userId = doc.data().userId as string | undefined;
    if (userId) users.add(userId);
  });

  return users;
}

async function backfillSurvey(surveyId: string, dryRun: boolean): Promise<BackfillSummary> {
  const db = getFirestoreAdmin();
  const summary: BackfillSummary = {
    surveyId,
    anchorId: '',
    usersWithDemographics: 0,
    questionsProcessed: 0,
    evaluationsScanned: 0,
    evaluationsStamped: 0,
    alreadyStamped: 0,
    mismatchedAnchor: 0,
    outOfScope: 0,
  };

  console.log(`\n📋 Survey: ${surveyId} ${dryRun ? '(DRY RUN)' : ''}`);

  // 1. Load survey
  const surveyDoc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!surveyDoc.exists) {
    console.error(`  ❌ Survey not found`);

    return summary;
  }

  const survey = surveyDoc.data() as Survey;
  const anchorId = getSurveyAnchor(survey);
  summary.anchorId = anchorId;

  console.log(`  🔗 Demographic anchor: ${anchorId}`);
  console.log(`  📝 Questions in survey: ${survey.questionIds?.length ?? 0}`);

  if (!survey.questionIds || survey.questionIds.length === 0) {
    console.log(`  ℹ️  No questions to process`);

    return summary;
  }

  // 2. Collect the set of users who answered demographics under this anchor
  const users = await fetchUsersWithDemographicsForAnchor(db, anchorId);
  summary.usersWithDemographics = users.size;
  console.log(`  👥 Users with demographics under this anchor: ${users.size}`);

  if (users.size === 0) {
    console.log(`  ℹ️  No demographic answers found — nothing to backfill`);

    return summary;
  }

  // 3. For each question, fetch evaluations and stamp the anchor
  let batch: WriteBatch = db.batch();
  let batchCount = 0;

  for (const questionId of survey.questionIds) {
    summary.questionsProcessed += 1;

    const evalSnapshot = await db
      .collection(EVALUATIONS_COLLECTION)
      .where('statementId', '==', questionId)
      .get();

    for (const evalDoc of evalSnapshot.docs) {
      summary.evaluationsScanned += 1;
      const data = evalDoc.data();
      const evaluatorId = data.evaluatorId as string | undefined;

      if (!evaluatorId) {
        summary.outOfScope += 1;
        continue;
      }

      if (!users.has(evaluatorId)) {
        // Evaluator is not in this survey's demographic set — likely a
        // main-app direct evaluation or a different survey's participant.
        // Leave it alone.
        summary.outOfScope += 1;
        continue;
      }

      const existingAnchor = data.demographicAnchorId as string | undefined;
      if (existingAnchor === anchorId) {
        summary.alreadyStamped += 1;
        continue;
      }
      if (existingAnchor && existingAnchor !== anchorId) {
        summary.mismatchedAnchor += 1;
        console.warn(
          `    ⚠️  ${evalDoc.id} already has a different anchor (${existingAnchor}) — leaving as-is`,
        );
        continue;
      }

      // Stamp the anchor. Updating via set/merge ensures the onUpdate
      // trigger fires — which in turn re-runs updateUserDemographicEvaluation
      // with the anchor, rewriting the polarization snapshot for this
      // question.
      if (!dryRun) {
        batch.set(evalDoc.ref, { demographicAnchorId: anchorId }, { merge: true });
        batchCount += 1;

        if (batchCount >= FIRESTORE_BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      summary.evaluationsStamped += 1;
    }

    console.log(
      `    • ${questionId} — scanned ${evalSnapshot.size}, stamped so far: ${summary.evaluationsStamped}`,
    );
  }

  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }

  return summary;
}

function printSummary(summary: BackfillSummary, dryRun: boolean): void {
  console.log('\n========== SUMMARY ==========');
  console.log(`Survey:                   ${summary.surveyId}`);
  console.log(`Anchor statementId:       ${summary.anchorId}`);
  console.log(`Users with demographics:  ${summary.usersWithDemographics}`);
  console.log(`Questions processed:      ${summary.questionsProcessed}`);
  console.log(`Evaluations scanned:      ${summary.evaluationsScanned}`);
  console.log(`Evaluations stamped:      ${summary.evaluationsStamped}`);
  console.log(`Already stamped (skip):   ${summary.alreadyStamped}`);
  console.log(`Mismatched anchor (skip): ${summary.mismatchedAnchor}`);
  console.log(`Out of scope (skip):      ${summary.outOfScope}`);
  console.log('=============================');

  if (dryRun) {
    console.log('\nDRY RUN — no writes performed. Re-run without --dry-run to commit.');
  } else {
    console.log(
      '\n✓ Writes committed. The Firestore onUpdate trigger will now re-run',
    );
    console.log(
      '  updateUserDemographicEvaluation for each stamped evaluation, rewriting',
    );
    console.log(
      '  the polarization snapshots. Allow a few minutes for the trigger fleet',
    );
    console.log(
      '  to catch up before reviewing polarization charts in the main app.',
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const surveyId = args.find((a) => !a.startsWith('--'));

  if (!surveyId) {
    console.error(
      'Usage: npx tsx scripts/backfill-survey-demographic-anchor.ts <surveyId> [--dry-run]',
    );
    process.exit(1);
  }

  try {
    const summary = await backfillSurvey(surveyId, dryRun);
    printSummary(summary, dryRun);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  }
}

main();
