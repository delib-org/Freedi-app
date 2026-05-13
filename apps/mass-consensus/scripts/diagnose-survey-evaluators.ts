/**
 * Read-only diagnostic: for a given survey, breakdown the evaluations
 * on its question(s) by which evaluator-identifying fields are present.
 *
 * The results endpoint at apps/mass-consensus/app/api/surveys/[id]/results/route.ts:45-63
 * counts an evaluation as a "real evaluator" only if `evaluator.uid` is set
 * (to exclude the auto +1 written when someone submits their own solution,
 * which only sets `evaluatorId`). If old buggy evaluations from the start
 * of the survey were written without the nested `evaluator` object, they
 * are silently dropped from the evaluator-demographic count even though
 * they are real ratings.
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel npx tsx scripts/diagnose-survey-evaluators.ts <surveyId>
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

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
const STATEMENTS_COLLECTION = 'statements';

interface Survey {
  surveyId: string;
  questionIds: string[];
  parentStatementId?: string;
}

function getSurveyAnchor(survey: Survey): string {
  if (survey.parentStatementId) return survey.parentStatementId;

  return survey.surveyId;
}

async function diagnose(surveyId: string): Promise<void> {
  const db = getFirestoreAdmin();

  console.log(`\n📋 Diagnosing survey: ${surveyId}\n`);

  const surveyDoc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!surveyDoc.exists) {
    console.error('  ❌ Survey not found');

    return;
  }
  const survey = surveyDoc.data() as Survey;
  const anchorId = getSurveyAnchor(survey);
  console.log(`  🔗 Anchor: ${anchorId}`);
  console.log(`  📝 Questions: ${(survey.questionIds || []).length}\n`);

  // Build the set of users who answered demographics under the anchor.
  const usersDataSnap = await db
    .collection(USERS_DATA_COLLECTION)
    .where('statementId', '==', anchorId)
    .get();

  const demographicUsers = new Set<string>();
  usersDataSnap.docs.forEach((d: QueryDocumentSnapshot) => {
    const uid = d.data().userId as string | undefined;
    if (uid) demographicUsers.add(uid);
  });
  console.log(`  👥 Users with demographics under anchor: ${demographicUsers.size}\n`);

  for (const questionId of survey.questionIds || []) {
    const evalSnap = await db
      .collection(EVALUATIONS_COLLECTION)
      .where('parentId', '==', questionId)
      .get();

    let withEvaluatorObj = 0;
    let withEvaluatorUid = 0;
    let onlyEvaluatorId = 0;
    let withDemographicAnchor = 0;
    let neither = 0;

    const distinctByEvaluatorUid = new Set<string>();
    const distinctByEvaluatorId = new Set<string>();
    const distinctByEvaluatorIdInDemographics = new Set<string>();
    const distinctByEvaluatorUidInDemographics = new Set<string>();

    evalSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const evaluator = data.evaluator as { uid?: string } | undefined;
      const evaluatorId = data.evaluatorId as string | undefined;
      const anchor = data.demographicAnchorId as string | undefined;

      if (evaluator) withEvaluatorObj += 1;
      if (evaluator?.uid) {
        withEvaluatorUid += 1;
        distinctByEvaluatorUid.add(evaluator.uid);
        if (demographicUsers.has(evaluator.uid)) {
          distinctByEvaluatorUidInDemographics.add(evaluator.uid);
        }
      } else if (evaluatorId) {
        onlyEvaluatorId += 1;
      } else {
        neither += 1;
      }

      if (evaluatorId) {
        distinctByEvaluatorId.add(evaluatorId);
        if (demographicUsers.has(evaluatorId)) {
          distinctByEvaluatorIdInDemographics.add(evaluatorId);
        }
      }

      if (anchor) withDemographicAnchor += 1;
    });

    // Sample 3 docs that lack evaluator.uid for inspection
    const sampleNoUid: Array<{ id: string; keys: string[]; evaluatorId?: string; anchor?: string }> = [];
    for (const d of evalSnap.docs) {
      const data = d.data();
      const evaluator = data.evaluator as { uid?: string } | undefined;
      if (!evaluator?.uid) {
        sampleNoUid.push({
          id: d.id,
          keys: Object.keys(data),
          evaluatorId: data.evaluatorId,
          anchor: data.demographicAnchorId,
        });
        if (sampleNoUid.length >= 3) break;
      }
    }

    console.log(`  Question ${questionId}:`);
    console.log(`    Total evaluations:                    ${evalSnap.size}`);
    console.log(`    With nested evaluator object:         ${withEvaluatorObj}`);
    console.log(`    With evaluator.uid set:               ${withEvaluatorUid}`);
    console.log(`    Only evaluatorId (no nested obj):     ${onlyEvaluatorId}`);
    console.log(`    Neither:                              ${neither}`);
    console.log(`    With demographicAnchorId set:         ${withDemographicAnchor}`);
    console.log(`    Distinct evaluators by evaluator.uid: ${distinctByEvaluatorUid.size}`);
    console.log(`    Distinct evaluators by evaluatorId:   ${distinctByEvaluatorId.size}`);
    console.log(`    ↑ ∩ demographic users (.uid path):    ${distinctByEvaluatorUidInDemographics.size}`);
    console.log(`    ↑ ∩ demographic users (.id  path):    ${distinctByEvaluatorIdInDemographics.size}`);

    if (sampleNoUid.length > 0) {
      console.log(`\n    Sample docs missing evaluator.uid:`);
      sampleNoUid.forEach((s) => {
        console.log(`      • ${s.id}`);
        console.log(`        evaluatorId=${s.evaluatorId}`);
        console.log(`        demographicAnchorId=${s.anchor}`);
        console.log(`        fields=[${s.keys.join(', ')}]`);
      });
    }

    // Also peek at the question statement doc to confirm hierarchy
    const stmtDoc = await db.collection(STATEMENTS_COLLECTION).doc(questionId).get();
    if (stmtDoc.exists) {
      const stmt = stmtDoc.data();
      console.log(`\n    Statement.parentId: ${stmt?.parentId}`);
      console.log(`    Statement.topParentId: ${stmt?.topParentId}`);
    }
  }
}

async function main(): Promise<void> {
  const surveyId = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!surveyId) {
    console.error('Usage: npx tsx scripts/diagnose-survey-evaluators.ts <surveyId>');
    process.exit(1);
  }
  try {
    await diagnose(surveyId);
    process.exit(0);
  } catch (err) {
    console.error('Diagnostic failed:', err);
    process.exit(1);
  }
}

main();
