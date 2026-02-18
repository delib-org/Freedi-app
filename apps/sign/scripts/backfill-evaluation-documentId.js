/**
 * Backfill script: Add documentId to evaluations that are missing it.
 *
 * For each evaluation without a documentId:
 *   1. Look up the statement referenced by evaluation.statementId
 *   2. Get topParentId from that statement
 *   3. Update the evaluation with documentId = topParentId
 *
 * Usage:
 *   node scripts/backfill-evaluation-documentId.js [--dry-run] [--project test|prod]
 *
 * Options:
 *   --dry-run   Show what would be updated without writing (default)
 *   --execute   Actually perform the updates
 *   --project   Which project: "test" (default) or "prod"
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');
const projectArg = args.includes('--project')
  ? args[args.indexOf('--project') + 1]
  : 'test';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n');

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore(app);
  const projectId = process.env.FIREBASE_PROJECT_ID;

  console.log(`Project: ${projectId}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (use --execute to write)' : 'EXECUTING UPDATES'}`);
  console.log('---');

  // 1. Fetch all evaluations
  console.log('Fetching all evaluations...');
  const evalSnapshot = await db.collection('evaluations').get();
  console.log(`Total evaluations: ${evalSnapshot.size}`);

  // 2. Filter those missing documentId
  const missingDocId = [];
  evalSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.documentId) {
      missingDocId.push({ id: doc.id, data });
    }
  });

  console.log(`Evaluations missing documentId: ${missingDocId.length}`);

  if (missingDocId.length === 0) {
    console.log('Nothing to backfill. Done!');
    process.exit(0);
  }

  // 3. Collect unique statementIds to look up
  const statementIds = [...new Set(missingDocId.map((e) => e.data.statementId).filter(Boolean))];
  console.log(`Unique statementIds to look up: ${statementIds.length}`);

  // 4. Batch-fetch statements to get topParentId
  const statementMap = new Map(); // statementId -> topParentId
  const BATCH_SIZE = 100; // Firestore getAll limit

  for (let i = 0; i < statementIds.length; i += BATCH_SIZE) {
    const batch = statementIds.slice(i, i + BATCH_SIZE);
    const refs = batch.map((id) => db.collection('statements').doc(id));
    const docs = await db.getAll(...refs);

    docs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data.topParentId) {
          statementMap.set(doc.id, data.topParentId);
        }
      }
    });

    console.log(`  Fetched statements batch ${Math.floor(i / BATCH_SIZE) + 1}: ${docs.filter((d) => d.exists).length} found`);
  }

  console.log(`Resolved topParentId for ${statementMap.size} statements`);

  // 5. Build updates
  const updates = [];
  const unresolved = [];

  missingDocId.forEach(({ id, data }) => {
    const topParentId = statementMap.get(data.statementId);
    if (topParentId) {
      updates.push({ evalId: id, documentId: topParentId, statementId: data.statementId });
    } else {
      unresolved.push({ evalId: id, statementId: data.statementId });
    }
  });

  console.log(`\nUpdates to apply: ${updates.length}`);
  console.log(`Unresolved (statement not found): ${unresolved.length}`);

  if (unresolved.length > 0 && unresolved.length <= 20) {
    console.log('Unresolved evaluation IDs:');
    unresolved.forEach((u) => console.log(`  - ${u.evalId} (statementId: ${u.statementId})`));
  }

  // 6. Apply updates in batches of 500
  if (isDryRun) {
    console.log('\n--- DRY RUN - No changes written ---');
    if (updates.length <= 20) {
      updates.forEach((u) => {
        console.log(`  Would update ${u.evalId}: documentId = ${u.documentId}`);
      });
    } else {
      updates.slice(0, 10).forEach((u) => {
        console.log(`  Would update ${u.evalId}: documentId = ${u.documentId}`);
      });
      console.log(`  ... and ${updates.length - 10} more`);
    }
    console.log('\nRun with --execute to apply these changes.');
  } else {
    const WRITE_BATCH_SIZE = 500;
    let written = 0;

    for (let i = 0; i < updates.length; i += WRITE_BATCH_SIZE) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + WRITE_BATCH_SIZE);

      chunk.forEach(({ evalId, documentId }) => {
        const ref = db.collection('evaluations').doc(evalId);
        batch.update(ref, { documentId });
      });

      await batch.commit();
      written += chunk.length;
      console.log(`  Written batch: ${written}/${updates.length}`);
    }

    console.log(`\nDone! Updated ${written} evaluations with documentId.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
