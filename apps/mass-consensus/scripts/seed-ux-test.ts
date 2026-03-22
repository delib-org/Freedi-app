/**
 * Seed script to create a test survey with 3 questions (each having 6 options)
 * and partial evaluations for a specific user, so you can see:
 *   - Batch button is outlined (secondary)
 *   - Progress bar fills as you rate
 *   - Completion banner appears after rating all options in a batch
 *   - "Next Question" navigates to next question
 *   - Completion page shows per-question stats
 *
 * Usage:
 *   cd apps/mass-consensus
 *   npx tsx scripts/seed-ux-test.ts
 *
 * Then visit: http://localhost:3001/s/<surveyId>/q/0
 * (The survey ID is printed at the end)
 */

import { readFileSync } from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !match[1].startsWith('#')) {
        const key = match[1].trim();
        let value = match[2].trim();
        value = value.replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch {
    // File may not exist, that's OK
  }
}

// Load env files in same priority as Next.js: .env.local overrides .env
// But since we use "if not already set", load .env.local first
loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

// ============================================================
// CONFIG
// ============================================================
const USER_ID = 'z9kqGvBA3LP5HM7sY9usYEvKuoRx';
const ADMIN_USER_ID = 'seed-admin-user';

function uid(): string {
  return `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const now = Date.now();

// ============================================================
// Questions & Options
// ============================================================
const questions = [
  {
    id: uid(),
    text: 'How should we reduce traffic congestion in the city?',
    options: [
      'Build more bike lanes and pedestrian paths',
      'Expand public transit routes and frequency',
      'Implement congestion pricing for downtown area',
      'Create more remote work incentives for employers',
      'Add park-and-ride lots at city borders',
      'Convert one-way streets to two-way traffic',
    ],
  },
  {
    id: uid(),
    text: 'What should be our top priority for improving public education?',
    options: [
      'Reduce class sizes to under 20 students',
      'Increase teacher salaries by 30%',
      'Integrate technology and AI tools into every classroom',
      'Expand after-school programs and tutoring',
      'Provide free meals and school supplies to all students',
      'Modernize curriculum to focus on critical thinking',
    ],
  },
  {
    id: uid(),
    text: 'How can we make housing more affordable in our community?',
    options: [
      'Build more mixed-income housing developments',
      'Offer tax incentives for first-time home buyers',
      'Reform zoning laws to allow more density',
      'Create community land trusts',
      'Cap annual rent increases at inflation rate',
      'Convert unused commercial buildings to residential',
    ],
  },
];

// ============================================================
// Build Firestore documents
// ============================================================
async function seed() {
  const db = getFirestoreAdmin();
  const batch = db.batch();

  const surveyId = `survey_${now}_uxtest`;
  const questionIds = questions.map(q => q.id);

  // Creator user stub
  const creator = {
    uid: ADMIN_USER_ID,
    displayName: 'Seed Admin',
    email: '',
    photoURL: '',
    isAnonymous: false,
  };

  // 1. Create Statement docs for each question + its options
  const allOptionIds: Record<string, string[]> = {};

  for (const q of questions) {
    // Question statement
    const questionDoc = {
      statementId: q.id,
      statement: q.text,
      statementType: 'question',
      parentId: 'top',
      topParentId: q.id,
      creatorId: ADMIN_USER_ID,
      creator,
      createdAt: now,
      lastUpdate: now,
      consensus: 0,
      paragraphs: [],
      parents: [],
      statementSettings: {
        showEvaluation: true,
        enableAddEvaluationOption: true,
        enableAddVotingOption: true,
        enableSimilaritiesSearch: true,
        enableNavigationalElements: true,
      },
      stageSelectionType: 'consensus',
      randomSeed: Math.random(),
      hide: false,
      numberOfOptions: q.options.length,
    };

    batch.set(db.collection('statements').doc(q.id), questionDoc);

    // Option statements
    const optionIds: string[] = [];
    for (const optionText of q.options) {
      const optionId = uid();
      optionIds.push(optionId);

      const optionDoc = {
        statementId: optionId,
        statement: optionText,
        statementType: 'option',
        parentId: q.id,
        topParentId: q.id,
        creatorId: ADMIN_USER_ID,
        creator,
        createdAt: now,
        lastUpdate: now,
        consensus: 0,
        paragraphs: [],
        parents: [q.id],
        statementSettings: {
          showEvaluation: true,
          enableAddEvaluationOption: true,
          enableAddVotingOption: true,
          enableSimilaritiesSearch: true,
          enableNavigationalElements: true,
        },
        stageSelectionType: 'consensus',
        randomSeed: Math.random(),
        hide: false,
      };

      batch.set(db.collection('statements').doc(optionId), optionDoc);
    }

    allOptionIds[q.id] = optionIds;
  }

  // 2. Create Survey document
  const surveyDoc = {
    surveyId,
    title: 'UX Test Survey - City Improvements',
    description: 'Test survey with 3 questions to verify evaluation UX improvements',
    creatorId: ADMIN_USER_ID,
    questionIds,
    settings: {
      allowSkipping: false,
      allowReturning: true,
      minEvaluationsPerQuestion: 3,
      showQuestionPreview: false,
      randomizeQuestions: false,
      allowParticipantsToAddSuggestions: true,
      suggestionMode: 'encourage',
      displayMode: 'classic',
    },
    questionSettings: {},
    status: 'active',
    createdAt: now,
    lastUpdate: now,
    isTestMode: true,
  };

  batch.set(db.collection('surveys').doc(surveyId), surveyDoc);

  // 3. Create partial evaluations for USER_ID on question 1 only (3 out of 6 evaluated)
  // This way user can see progress bar partially filled on Q1, empty on Q2 & Q3
  const q1OptionIds = allOptionIds[questions[0].id];
  const evaluatedQ1Options = q1OptionIds.slice(0, 3); // First 3 options evaluated

  for (const optionId of evaluatedQ1Options) {
    const evalId = `${USER_ID}--${optionId}`;
    const score = [-0.5, 0, 0.5][Math.floor(Math.random() * 3)]; // Random score

    const evalDoc = {
      parentId: questions[0].id,
      evaluationId: evalId,
      statementId: optionId,
      evaluatorId: USER_ID,
      updatedAt: now,
      evaluation: score,
    };

    batch.set(db.collection('evaluations').doc(evalId), evalDoc);
  }

  // 4. Create UserEvaluation tracking doc for Q1
  const userEvalId = `${USER_ID}--${questions[0].id}`;
  const userEvalDoc = {
    userEvaluationId: userEvalId,
    userId: USER_ID,
    parentStatementId: questions[0].id,
    evaluatedOptionsIds: evaluatedQ1Options,
    createdAt: now,
    lastUpdated: now,
    evaluatedCount: evaluatedQ1Options.length,
    totalOptionsAvailable: q1OptionIds.length,
  };

  batch.set(db.collection('userEvaluations').doc(userEvalId), userEvalDoc);

  // 5. Set anonymous user cookie mapping (so the app recognizes this user)
  // The MC app uses a cookie-based anonymous user, but for testing
  // we just need the data in Firestore. The user will be recognized
  // by the userId stored in localStorage.

  // Commit all
  await batch.commit();

  console.info('\n=== SEED DATA CREATED ===\n');
  console.info(`Survey ID:  ${surveyId}`);
  console.info(`User ID:    ${USER_ID}`);
  console.info(`Questions:  ${questions.length}`);
  console.info(`Options per question: 6`);
  console.info(`Pre-evaluated on Q1: 3 of 6`);
  console.info('');
  console.info('Display mode: classic (list view) - so you can see the batch button + progress bar');
  console.info('');
  console.info(`Open this URL to test:`);
  console.info(`  http://localhost:3001/s/${surveyId}/q/0`);
  console.info('');
  console.info('What to verify:');
  console.info('  1. Batch button is outlined (not filled primary)');
  console.info('  2. Progress bar shows "3 of 6 rated" on Q1');
  console.info('  3. Rate the remaining 3 options on Q1 → banner appears');
  console.info('  4. Click "Next Question" → navigates to Q2');
  console.info('  5. Rate all 6 on Q2 → banner appears again');
  console.info('  6. Finish all → completion page shows per-question stats');
  console.info('');
}

seed().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Seed failed:', error);
  process.exit(1);
});
