/**
 * Seed script: creates a survey with 3 questions + 1 demographic page,
 * then creates evaluations for YOUR user so the completion page shows
 * per-question stats and demographic completion.
 *
 * Also creates evaluations for a few fake users so you see realistic data.
 *
 * Usage:
 *   cd apps/mass-consensus
 *   npx tsx scripts/seed-completion-test.ts
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
    // File may not exist
  }
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirestoreAdmin } = require('../src/lib/firebase/admin');

// ============================================================
const USER_ID = 'z9kqGvBA3LP5HM7sY9usYEvKuoRx';
const ADMIN_ID = 'seed-admin';
const now = Date.now();

function uid(prefix = 'seed'): string {
  return `${prefix}_${now}_${Math.random().toString(36).substring(2, 9)}`;
}

const creator = {
  uid: ADMIN_ID,
  displayName: 'Admin',
  email: '',
  photoURL: '',
  isAnonymous: false,
};

// ============================================================
// Define 3 questions, each with 6 options
// ============================================================
const questionsData = [
  {
    id: uid('q'),
    text: 'How should we improve public transportation?',
    options: [
      'Add more bus routes to suburbs',
      'Build a light rail system downtown',
      'Offer free rides during rush hour',
      'Create dedicated bus-only lanes',
      'Extend subway hours to midnight',
      'Introduce on-demand micro-transit vans',
    ],
  },
  {
    id: uid('q'),
    text: 'What is the best way to reduce food waste?',
    options: [
      'Require grocery stores to donate unsold food',
      'Teach food preservation in schools',
      'Create a city composting program',
      'Tax single-use food packaging',
      'Fund community fridges in every neighborhood',
      'Launch an app connecting restaurants with surplus food to users',
    ],
  },
  {
    id: uid('q'),
    text: 'How can we make our parks more accessible?',
    options: [
      'Add wheelchair-friendly trails',
      'Install better lighting for evening visitors',
      'Build more playgrounds for all abilities',
      'Provide free bike and equipment rentals',
      'Create quiet zones for sensory-sensitive visitors',
      'Offer guided nature walks in multiple languages',
    ],
  },
];

// ============================================================
// Demographic page + questions
// ============================================================
const demoPageId = uid('dp');
const demoQ1Id = uid('dq');
const demoQ2Id = uid('dq');

// ============================================================
async function seed() {
  const db = getFirestoreAdmin();
  const batch = db.batch();

  const surveyId = `survey_${now}_complete`;
  const questionIds = questionsData.map(q => q.id);

  // Track all option IDs per question
  const allOptionIds: Record<string, string[]> = {};

  // --- 1. Create question & option Statement docs ---
  for (const q of questionsData) {
    batch.set(db.collection('statements').doc(q.id), {
      statementId: q.id,
      statement: q.text,
      statementType: 'question',
      parentId: 'top',
      topParentId: q.id,
      creatorId: ADMIN_ID,
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
    });

    const optIds: string[] = [];
    for (const text of q.options) {
      const oid = uid('o');
      optIds.push(oid);
      batch.set(db.collection('statements').doc(oid), {
        statementId: oid,
        statement: text,
        statementType: 'option',
        parentId: q.id,
        topParentId: q.id,
        creatorId: ADMIN_ID,
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
      });
    }
    allOptionIds[q.id] = optIds;
  }

  // --- 2. Create demographic questions ---
  batch.set(db.collection('userDemographicQuestions').doc(demoQ1Id), {
    userQuestionId: demoQ1Id,
    statementId: surveyId,
    topParentId: surveyId,
    question: 'What is your age group?',
    questionType: 'singleChoice',
    options: ['18-24', '25-34', '35-44', '45-54', '55+'],
    isRequired: true,
    position: 0,
    createdAt: now,
  });

  batch.set(db.collection('userDemographicQuestions').doc(demoQ2Id), {
    userQuestionId: demoQ2Id,
    statementId: surveyId,
    topParentId: surveyId,
    question: 'What neighborhood do you live in?',
    questionType: 'freeText',
    options: [],
    isRequired: false,
    position: 1,
    createdAt: now,
  });

  // --- 3. Create survey ---
  batch.set(db.collection('surveys').doc(surveyId), {
    surveyId,
    title: 'Community Priorities Survey',
    description: 'Help us decide what matters most for our city.',
    creatorId: ADMIN_ID,
    questionIds,
    settings: {
      allowSkipping: true,
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
    demographicPages: [
      {
        demographicPageId: demoPageId,
        title: 'About You',
        description: 'Tell us a little about yourself.',
        position: -1, // After all questions
        required: true,
        customQuestionIds: [demoQ1Id, demoQ2Id],
      },
    ],
  });

  // --- 4. Evaluations for YOUR user ---
  // Q1: all 6 evaluated (complete)
  const q1Opts = allOptionIds[questionsData[0].id];
  for (const oid of q1Opts) {
    const evalId = `${USER_ID}--${oid}`;
    batch.set(db.collection('evaluations').doc(evalId), {
      parentId: questionsData[0].id,
      evaluationId: evalId,
      statementId: oid,
      evaluatorId: USER_ID,
      updatedAt: now,
      evaluation: [-1, -0.5, 0, 0.5, 0.5, 1][q1Opts.indexOf(oid)],
    });
  }
  batch.set(db.collection('userEvaluations').doc(`${USER_ID}--${questionsData[0].id}`), {
    userEvaluationId: `${USER_ID}--${questionsData[0].id}`,
    userId: USER_ID,
    parentStatementId: questionsData[0].id,
    evaluatedOptionsIds: q1Opts,
    createdAt: now,
    lastUpdated: now,
    evaluatedCount: 6,
    totalOptionsAvailable: 6,
  });

  // Q2: 4 of 6 evaluated (partial)
  const q2Opts = allOptionIds[questionsData[1].id];
  const q2Evaluated = q2Opts.slice(0, 4);
  for (const oid of q2Evaluated) {
    const evalId = `${USER_ID}--${oid}`;
    batch.set(db.collection('evaluations').doc(evalId), {
      parentId: questionsData[1].id,
      evaluationId: evalId,
      statementId: oid,
      evaluatorId: USER_ID,
      updatedAt: now,
      evaluation: [0.5, -0.5, 0, 1][q2Evaluated.indexOf(oid)],
    });
  }
  batch.set(db.collection('userEvaluations').doc(`${USER_ID}--${questionsData[1].id}`), {
    userEvaluationId: `${USER_ID}--${questionsData[1].id}`,
    userId: USER_ID,
    parentStatementId: questionsData[1].id,
    evaluatedOptionsIds: q2Evaluated,
    createdAt: now,
    lastUpdated: now,
    evaluatedCount: 4,
    totalOptionsAvailable: 6,
  });

  // Q3: 0 evaluated (not started)
  // (no docs needed)

  // --- 5. Demographic answers for YOUR user (completed) ---
  batch.set(db.collection('usersData').doc(`${demoQ1Id}--${USER_ID}`), {
    userQuestionId: demoQ1Id,
    statementId: surveyId,
    topParentId: surveyId,
    userId: USER_ID,
    answer: '25-34',
    answerOptions: ['25-34'],
    question: 'What is your age group?',
    questionType: 'singleChoice',
  });

  batch.set(db.collection('usersData').doc(`${demoQ2Id}--${USER_ID}`), {
    userQuestionId: demoQ2Id,
    statementId: surveyId,
    topParentId: surveyId,
    userId: USER_ID,
    answer: 'Downtown',
    question: 'What neighborhood do you live in?',
    questionType: 'freeText',
  });

  // --- 6. Survey progress for YOUR user ---
  batch.set(db.collection('surveyProgress').doc(`${surveyId}--${USER_ID}`), {
    progressId: `${surveyId}--${USER_ID}`,
    surveyId,
    userId: USER_ID,
    currentQuestionIndex: 4, // Past all items
    completedQuestionIds: questionIds,
    startedAt: now - 600000,
    lastUpdated: now,
    isCompleted: true,
  });

  // --- 7. Fake users for funnel data ---
  // Simulates: 20 entered, 15 did Q1, 9 did Q2, 5 did Q3, 4 completed
  const fakeUsers = Array.from({ length: 19 }, (_, i) => `fake_user_${i}`);

  for (let i = 0; i < fakeUsers.length; i++) {
    const fuid = fakeUsers[i];
    const didQ1 = i < 14; // 14 fake + 1 real = 15
    const didQ2 = i < 8;  // 8 fake + 1 real = 9
    const didQ3 = i < 4;  // 4 fake + 0 real = 4 (real user didn't do Q3)
    const completed = i < 3; // 3 fake + 1 real = 4

    // Progress doc (everyone who entered gets one)
    batch.set(db.collection('surveyProgress').doc(`${surveyId}--${fuid}`), {
      progressId: `${surveyId}--${fuid}`,
      surveyId,
      userId: fuid,
      currentQuestionIndex: completed ? 4 : didQ3 ? 3 : didQ2 ? 2 : didQ1 ? 1 : 0,
      completedQuestionIds: completed ? questionIds : [],
      startedAt: now - 300000 - i * 60000,
      lastUpdated: now - i * 30000,
      isCompleted: completed,
    });

    // UserEvaluation docs (one per question they evaluated)
    if (didQ1) {
      batch.set(db.collection('userEvaluations').doc(`${fuid}--${questionsData[0].id}`), {
        userEvaluationId: `${fuid}--${questionsData[0].id}`,
        userId: fuid,
        parentStatementId: questionsData[0].id,
        evaluatedOptionsIds: allOptionIds[questionsData[0].id].slice(0, 3 + Math.floor(Math.random() * 4)),
        createdAt: now,
        lastUpdated: now,
      });
    }
    if (didQ2) {
      batch.set(db.collection('userEvaluations').doc(`${fuid}--${questionsData[1].id}`), {
        userEvaluationId: `${fuid}--${questionsData[1].id}`,
        userId: fuid,
        parentStatementId: questionsData[1].id,
        evaluatedOptionsIds: allOptionIds[questionsData[1].id].slice(0, 2 + Math.floor(Math.random() * 5)),
        createdAt: now,
        lastUpdated: now,
      });
    }
    if (didQ3) {
      batch.set(db.collection('userEvaluations').doc(`${fuid}--${questionsData[2].id}`), {
        userEvaluationId: `${fuid}--${questionsData[2].id}`,
        userId: fuid,
        parentStatementId: questionsData[2].id,
        evaluatedOptionsIds: allOptionIds[questionsData[2].id].slice(0, 2 + Math.floor(Math.random() * 5)),
        createdAt: now,
        lastUpdated: now,
      });
    }
  }

  // --- Commit ---
  await batch.commit();

  console.info('\n=== COMPLETION TEST DATA CREATED ===\n');
  console.info(`Survey ID:  ${surveyId}`);
  console.info(`User:       ${USER_ID}`);
  console.info('');
  console.info('Funnel data (20 users total):');
  console.info('  Entered survey:  20  (100%)');
  console.info('  Evaluated Q1:    15  (75%)');
  console.info('  Evaluated Q2:     9  (45%)');
  console.info('  Evaluated Q3:     4  (20%)');
  console.info('  Completed:        4  (20%)');
  console.info('');
  console.info('Your evaluation status:');
  console.info(`  Q1 "${questionsData[0].text.substring(0, 40)}..." → 6/6`);
  console.info(`  Q2 "${questionsData[1].text.substring(0, 40)}..." → 4/6`);
  console.info(`  Q3 "${questionsData[2].text.substring(0, 40)}..." → 0/6`);
  console.info(`  Demographics "About You" → completed`);
  console.info('');
  console.info('Admin page (view funnel):');
  console.info(`  http://localhost:3001/admin/surveys/${surveyId}`);
  console.info('');
  console.info('Completion page (your stats):');
  console.info(`  http://localhost:3001/s/${surveyId}/complete`);
  console.info('');
  console.info('Start from question 1:');
  console.info(`  http://localhost:3001/s/${surveyId}/q/0`);
  console.info('');
}

seed().then(() => process.exit(0)).catch(e => { console.error('Seed failed:', e); process.exit(1); });
