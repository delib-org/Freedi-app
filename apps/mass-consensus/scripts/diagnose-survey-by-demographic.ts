/**
 * Read-only diagnostic: for a given survey, cross-tab each demographic
 * answer option against participation roles.
 *
 * Roles:
 *   - answered:       the user filled the demographic form
 *   - realEvaluator:  has at least one evaluation with evaluator.uid on a
 *                     question in this survey (i.e. explicitly rated something)
 *   - anyEvaluation:  has at least one evaluation (including auto +1 when
 *                     they submit their own solution) on a question in this
 *                     survey
 *   - solutionAdder:  created an option (solution) under a question in this
 *                     survey
 *
 * USAGE
 *   ENV_FILE=$(pwd)/.env.vercel \
 *     npx tsx scripts/diagnose-survey-by-demographic.ts <surveyId> [questionKey]
 *
 *   questionKey is the `userQuestionId` (or substring of the question text).
 *   If omitted, breaks down by every demographic question on the anchor.
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

interface DemographicAnswer {
  userId: string;
  userQuestionId: string;
  question: string;
  answer: string;
  type?: string;
}

async function diagnose(surveyId: string, questionKey: string | undefined): Promise<void> {
  const db = getFirestoreAdmin();

  const surveyDoc = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!surveyDoc.exists) {
    console.error('❌ Survey not found');

    return;
  }
  const survey = surveyDoc.data() as Survey;
  const anchorId = getSurveyAnchor(survey);

  console.log(`\n📋 Survey: ${surveyId}`);
  console.log(`  🔗 Anchor: ${anchorId}`);
  console.log(`  📝 Questions: ${(survey.questionIds || []).length}\n`);

  // 1. Load all demographic answers under this anchor.
  const usersDataSnap = await db
    .collection(USERS_DATA_COLLECTION)
    .where('statementId', '==', anchorId)
    .get();

  const answers: DemographicAnswer[] = usersDataSnap.docs.map((d: QueryDocumentSnapshot) => ({
    userId: d.data().userId as string,
    userQuestionId: d.data().userQuestionId as string,
    question: d.data().question as string,
    answer: String(d.data().answer ?? ''),
    type: d.data().type as string | undefined,
  }));
  console.log(`  usersData docs under anchor: ${answers.length}`);

  const allDemographicUsers = new Set(answers.map((a) => a.userId));
  console.log(`  Distinct users who answered demographics: ${allDemographicUsers.size}\n`);

  // 2. Walk every question in the survey and collect:
  //    - realEvaluators (evaluator.uid present)
  //    - anyEvaluation (includes auto +1 from solution submission)
  //    - solutionAdders (creatorId on the option statements)
  const realEvaluators = new Set<string>();
  const anyEvaluation = new Set<string>();
  const solutionAdders = new Set<string>();

  for (const questionId of survey.questionIds || []) {
    const [evalSnap, optionSnap] = await Promise.all([
      db.collection(EVALUATIONS_COLLECTION).where('parentId', '==', questionId).get(),
      db
        .collection(STATEMENTS_COLLECTION)
        .where('parentId', '==', questionId)
        .get(),
    ]);

    evalSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const evaluator = data.evaluator as { uid?: string } | undefined;
      const evaluatorId = data.evaluatorId as string | undefined;
      if (evaluator?.uid) {
        realEvaluators.add(evaluator.uid);
        anyEvaluation.add(evaluator.uid);
      } else if (evaluatorId) {
        anyEvaluation.add(evaluatorId);
      }
    });

    optionSnap.docs.forEach((d: QueryDocumentSnapshot) => {
      const data = d.data();
      const creatorId = data.creatorId as string | undefined;
      if (creatorId) solutionAdders.add(creatorId);
    });
  }

  console.log(`  realEvaluators (evaluator.uid set):  ${realEvaluators.size}`);
  console.log(`  anyEvaluation (incl. auto +1):       ${anyEvaluation.size}`);
  console.log(`  solutionAdders:                      ${solutionAdders.size}\n`);

  // 3. Group answers by question then by answer option.
  const byQuestion = new Map<string, DemographicAnswer[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.userQuestionId) || [];
    list.push(a);
    byQuestion.set(a.userQuestionId, list);
  }

  // 4. For each question (optionally filtered), count users-per-option
  //    across each participation role.
  for (const [qid, qAnswers] of byQuestion.entries()) {
    const sampleAnswer = qAnswers[0];
    const questionText = sampleAnswer?.question ?? '(no text)';

    if (
      questionKey &&
      qid !== questionKey &&
      !questionText.toLowerCase().includes(questionKey.toLowerCase())
    ) {
      continue;
    }

    console.log(`\n━━━ Question ${qid}: ${questionText} ━━━`);
    console.log(`  responses=${qAnswers.length}, distinct users=${new Set(qAnswers.map((a) => a.userId)).size}`);

    // Bucket users by answer value. `options` on the usersData doc is the
    // demographic question's *choice list*, not the user's selection — the
    // user's selection is always `answer` (a string for radio/select or a
    // comma-joined list for multi-select).
    const usersByOption = new Map<string, Set<string>>();
    for (const a of qAnswers) {
      const picks = a.answer.includes(',')
        ? a.answer.split(',').map((s) => s.trim()).filter(Boolean)
        : [a.answer].filter(Boolean);
      for (const pick of picks) {
        const bucket = usersByOption.get(pick) || new Set<string>();
        bucket.add(a.userId);
        usersByOption.set(pick, bucket);
      }
    }

    const totalRespondents = qAnswers.length;
    console.log(
      `\n  ${'Option'.padEnd(24)} ${'Responds'.padStart(8)} ${'Real Eval'.padStart(10)} ${'Any Eval'.padStart(9)} ${'Adder'.padStart(7)}`,
    );
    console.log(`  ${'─'.repeat(24)} ${'─'.repeat(8)} ${'─'.repeat(10)} ${'─'.repeat(9)} ${'─'.repeat(7)}`);

    const rows = Array.from(usersByOption.entries()).sort((a, b) => b[1].size - a[1].size);
    for (const [rawOption, users] of rows) {
      const option = String(rawOption ?? '');
      const respondCount = users.size;
      const realEvalCount = [...users].filter((u) => realEvaluators.has(u)).length;
      const anyEvalCount = [...users].filter((u) => anyEvaluation.has(u)).length;
      const adderCount = [...users].filter((u) => solutionAdders.has(u)).length;

      const pct = (n: number, d: number) => (d === 0 ? '  0%' : `${Math.round((100 * n) / d)}%`.padStart(3));
      console.log(
        `  ${option.slice(0, 24).padEnd(24)} ${String(respondCount).padStart(4)} ${pct(
          respondCount,
          totalRespondents,
        )} ${String(realEvalCount).padStart(5)} ${pct(realEvalCount, realEvaluators.size)} ${String(
          anyEvalCount,
        ).padStart(4)} ${pct(anyEvalCount, anyEvaluation.size)} ${String(adderCount).padStart(4)} ${pct(
          adderCount,
          solutionAdders.size,
        )}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [surveyId, questionKey] = args;
  if (!surveyId) {
    console.error(
      'Usage: npx tsx scripts/diagnose-survey-by-demographic.ts <surveyId> [questionKey]',
    );
    process.exit(1);
  }
  try {
    await diagnose(surveyId, questionKey);
    process.exit(0);
  } catch (err) {
    console.error('Diagnostic failed:', err);
    process.exit(1);
  }
}

main();
