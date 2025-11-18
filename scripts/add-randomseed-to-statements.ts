/**
 * Migration script to add randomSeed field to existing statements
 * This enables efficient random sampling for mass consensus questions
 *
 * Run with: npx tsx scripts/add-randomseed-to-statements.ts
 */

import * as admin from 'firebase-admin';
import { Collections } from 'delib-npm';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'freedi-test',
  });
}

// Connect to emulator if running locally
if (process.env.FIRESTORE_EMULATOR_HOST || true) {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
  console.info('🔧 Connected to Firestore emulator:', emulatorHost);
}

const db = admin.firestore();

async function addRandomSeedToStatements() {
  try {
    console.info('🚀 Starting migration: Adding randomSeed to statements...\n');

    // Get all statements without randomSeed field
    const statementsSnapshot = await db
      .collection(Collections.statements)
      .get();

    console.info(`📊 Found ${statementsSnapshot.size} total statements`);

    const batch = db.batch();
    let updateCount = 0;
    let skipCount = 0;

    for (const doc of statementsSnapshot.docs) {
      const data = doc.data();

      // Check if randomSeed already exists
      if (data.randomSeed !== undefined) {
        skipCount++;
        continue;
      }

      // Add randomSeed to statement
      batch.update(doc.ref, {
        randomSeed: Math.random(),
      });

      updateCount++;

      // Firebase batch limit is 500 operations
      if (updateCount % 500 === 0) {
        await batch.commit();
        console.info(`✅ Updated ${updateCount} statements...`);
      }
    }

    // Commit remaining updates
    if (updateCount % 500 !== 0) {
      await batch.commit();
    }

    console.info(`\n✨ Migration complete!`);
    console.info(`   Updated: ${updateCount} statements`);
    console.info(`   Skipped: ${skipCount} statements (already had randomSeed)`);
    console.info(`   Total: ${statementsSnapshot.size} statements\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
addRandomSeedToStatements()
  .then(() => {
    console.info('🎉 Migration successful!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
