/**
 * Seed script — creates a sample deliberation with needs + solutions in Firestore.
 *
 * Usage:
 *   npx tsx scripts/seed.ts                  # seeds Firestore emulator (localhost:8081)
 *   npx tsx scripts/seed.ts --prod           # seeds cloud Firestore (requires credentials)
 *   npx tsx scripts/seed.ts --clear          # clears seeded data then re-seeds
 *
 * After running, open:  http://localhost:3004/#!/d/demo-deliberation-1
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const USE_EMULATOR = !process.argv.includes('--prod');
const CLEAR_FIRST = process.argv.includes('--clear');

if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
}

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({ projectId: 'freedi-test' });

const db = getFirestore(app);

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------
const DELIBERATION_ID = 'demo-deliberation-1';
const NEEDS_QUESTION_ID = 'demo-needs-q1';
const SOLUTIONS_QUESTION_ID = 'demo-solutions-q1';
const SEED_USER_PREFIX = 'seed-user-';

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const DELIBERATION = {
  deliberationId: DELIBERATION_ID,
  title: 'How should we improve public transportation in our city?',
  description:
    'Our city is growing fast. Traffic is getting worse, and many people struggle to get around. Let\'s figure out what the real problems are and find solutions together.',
  needsQuestionId: NEEDS_QUESTION_ID,
  solutionsQuestionId: SOLUTIONS_QUESTION_ID,
  createdAt: Date.now(),
  lastUpdate: Date.now(),
  settings: {
    timeEstimateMinutes: 8,
    allowSkip: false,
    maxNeedsPerUser: 3,
    maxSolutionsPerUser: 3,
    evaluationsPerStage: 5,
  },
  participantCount: 42,
};

const NEEDS: Array<{ text: string; consensus: number }> = [
  { text: 'Buses are too infrequent — I often wait 30+ minutes during rush hour', consensus: 0.82 },
  { text: 'No safe bike lanes connecting residential areas to the city center', consensus: 0.75 },
  { text: 'The last bus/train leaves too early — impossible to get home after evening events', consensus: 0.71 },
  { text: 'Ticket prices keep rising but service quality stays the same or gets worse', consensus: 0.68 },
  { text: 'There is no real-time info at bus stops — you never know when the next bus actually comes', consensus: 0.65 },
  { text: 'Accessibility is terrible — many stations have no elevator or ramp', consensus: 0.63 },
  { text: 'Park-and-ride lots are always full by 7:30 AM', consensus: 0.58 },
  { text: 'The suburban areas have almost no public transport coverage', consensus: 0.55 },
  { text: 'Transfers between bus and rail are not coordinated — always a 15-min gap', consensus: 0.52 },
  { text: 'Night service is nonexistent — forces everyone to use cars or expensive taxis', consensus: 0.48 },
];

const SOLUTIONS: Array<{ text: string; consensus: number }> = [
  { text: 'Introduce a frequent bus network with 10-min headways on top 15 routes, 6AM-midnight', consensus: 0.79 },
  { text: 'Build a protected bike lane network connecting all neighborhoods to transit hubs', consensus: 0.74 },
  { text: 'Launch a real-time passenger info app with live bus/train tracking and delay alerts', consensus: 0.72 },
  { text: 'Add night buses on 5 main corridors running every 30 min from midnight to 5AM', consensus: 0.67 },
  { text: 'Make all stations fully accessible within 2 years — elevators, ramps, tactile paths', consensus: 0.65 },
  { text: 'Create a unified monthly pass that covers all transport modes at a flat rate', consensus: 0.62 },
  { text: 'Expand park-and-ride capacity by 50% and add real-time lot availability to the app', consensus: 0.58 },
  { text: 'Run a subsidized on-demand shuttle service in underserved suburban areas', consensus: 0.54 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeStatement(
  id: string,
  text: string,
  parentId: string,
  topParentId: string,
  creatorId: string,
  consensus: number,
  ageOffsetMs: number,
) {
  const created = Date.now() - ageOffsetMs;
  return {
    statementId: id,
    statement: text,
    parentId,
    topParentId,
    statementType: 'option',
    creatorId,
    createdAt: created,
    lastUpdate: created,
    consensus,
    evaluation: {
      sumEvaluations: Math.round(consensus * 42 * 2), // rough approximation
      numberOfEvaluators: Math.round(20 + Math.random() * 22),
      agreement: consensus,
    },
  };
}

function makeEvaluation(
  evaluatorId: string,
  statementId: string,
  parentId: string,
  value: number,
) {
  const evaluationId = `${evaluatorId}--${statementId}`;
  return {
    id: evaluationId,
    data: {
      evaluationId,
      evaluatorId,
      statementId,
      parentId,
      evaluation: value,
      updatedAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------
async function clearSeededData(): Promise<void> {
  console.info('Clearing previous seed data...');

  // Delete deliberation (stored in statements collection)
  await db.doc(`statements/${DELIBERATION_ID}`).delete().catch(() => {});

  // Delete needs
  const needsSnap = await db.collection('statements').where('parentId', '==', NEEDS_QUESTION_ID).get();
  const batch1 = db.batch();
  needsSnap.docs.forEach((d) => batch1.delete(d.ref));
  if (!needsSnap.empty) await batch1.commit();

  // Delete solutions
  const solSnap = await db.collection('statements').where('parentId', '==', SOLUTIONS_QUESTION_ID).get();
  const batch2 = db.batch();
  solSnap.docs.forEach((d) => batch2.delete(d.ref));
  if (!solSnap.empty) await batch2.commit();

  // Delete evaluations from seed users
  const evalSnap = await db.collection('evaluations')
    .where('odontologistId', '>=', SEED_USER_PREFIX)
    .where('odontologistId', '<=', SEED_USER_PREFIX + '\uf8ff')
    .get();
  const batch3 = db.batch();
  evalSnap.docs.forEach((d) => batch3.delete(d.ref));
  if (!evalSnap.empty) await batch3.commit();

  console.info(`  Deleted: ${needsSnap.size} needs, ${solSnap.size} solutions, ${evalSnap.size} evaluations`);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  console.info(`\nSeeding Firestore ${USE_EMULATOR ? '(emulator)' : '(cloud)'}...\n`);

  if (CLEAR_FIRST) {
    await clearSeededData();
  }

  // 1. Create deliberation as a statement (uses `statements` collection which
  //    has public read access, unlike a custom `deliberations` collection).
  //    The deliberation-specific config lives in `deliberationConfig`.
  await db.doc(`statements/${DELIBERATION_ID}`).set({
    statementId: DELIBERATION_ID,
    statement: DELIBERATION.title,
    description: DELIBERATION.description,
    statementType: 'deliberation',
    parentId: 'top',
    topParentId: DELIBERATION_ID,
    creatorId: 'system',
    createdAt: DELIBERATION.createdAt,
    lastUpdate: DELIBERATION.lastUpdate,
    consensus: 0,
    participantCount: DELIBERATION.participantCount,
    deliberationConfig: {
      needsQuestionId: DELIBERATION.needsQuestionId,
      solutionsQuestionId: DELIBERATION.solutionsQuestionId,
      settings: DELIBERATION.settings,
    },
  });
  console.info(`  Created deliberation: ${DELIBERATION_ID} (in statements collection)`);
  console.info(`    "${DELIBERATION.title}"`);

  // 2. Create need statements
  const needsBatch = db.batch();
  NEEDS.forEach((need, i) => {
    const id = `seed-need-${i + 1}`;
    const userId = `${SEED_USER_PREFIX}${(i % 6) + 1}`;
    const data = makeStatement(
      id,
      need.text,
      NEEDS_QUESTION_ID,
      DELIBERATION_ID,
      userId,
      need.consensus,
      (NEEDS.length - i) * 60_000, // stagger creation times
    );
    needsBatch.set(db.doc(`statements/${id}`), data);
  });
  await needsBatch.commit();
  console.info(`  Created ${NEEDS.length} needs under question ${NEEDS_QUESTION_ID}`);

  // 3. Create solution statements
  const solBatch = db.batch();
  SOLUTIONS.forEach((sol, i) => {
    const id = `seed-solution-${i + 1}`;
    const userId = `${SEED_USER_PREFIX}${(i % 6) + 1}`;
    const data = makeStatement(
      id,
      sol.text,
      SOLUTIONS_QUESTION_ID,
      DELIBERATION_ID,
      userId,
      sol.consensus,
      (SOLUTIONS.length - i) * 60_000,
    );
    solBatch.set(db.doc(`statements/${id}`), data);
  });
  await solBatch.commit();
  console.info(`  Created ${SOLUTIONS.length} solutions under question ${SOLUTIONS_QUESTION_ID}`);

  // 4. Create some evaluations (so the eval screens have data to show)
  const evalBatch = db.batch();
  let evalCount = 0;

  // Each of 6 seed users evaluates ~half the needs and solutions
  for (let u = 1; u <= 6; u++) {
    const userId = `${SEED_USER_PREFIX}${u}`;

    // Evaluate needs (skip their own)
    NEEDS.forEach((need, i) => {
      const creatorNum = (i % 6) + 1;
      if (creatorNum === u) return; // skip own
      if (Math.random() > 0.6) return; // not everyone evaluates everything

      const statementId = `seed-need-${i + 1}`;
      const value = need.consensus > 0.6 ? (Math.random() > 0.3 ? 0.5 : 1) : (Math.random() > 0.5 ? 0 : -0.5);
      const ev = makeEvaluation(userId, statementId, NEEDS_QUESTION_ID, value);
      evalBatch.set(db.doc(`evaluations/${ev.id}`), ev.data);
      evalCount++;
    });

    // Evaluate solutions
    SOLUTIONS.forEach((sol, i) => {
      const creatorNum = (i % 6) + 1;
      if (creatorNum === u) return;
      if (Math.random() > 0.6) return;

      const statementId = `seed-solution-${i + 1}`;
      const value = sol.consensus > 0.6 ? (Math.random() > 0.3 ? 0.5 : 1) : (Math.random() > 0.5 ? 0 : -0.5);
      const ev = makeEvaluation(userId, statementId, SOLUTIONS_QUESTION_ID, value);
      evalBatch.set(db.doc(`evaluations/${ev.id}`), ev.data);
      evalCount++;
    });
  }
  await evalBatch.commit();
  console.info(`  Created ${evalCount} evaluations from 6 seed users`);

  // Summary
  console.info(`
Seed complete!

Open the bot app at:
  http://localhost:3004/#!/d/${DELIBERATION_ID}

Return journey:
  http://localhost:3004/#!/d/${DELIBERATION_ID}/back

Make sure the Firestore emulator is running on localhost:8081
  npm run deve   (from repo root)
`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
