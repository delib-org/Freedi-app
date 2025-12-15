/**
 * Migration Script: Convert description field to paragraphs array
 *
 * This script migrates existing Statement documents from using
 * the deprecated `description` field to the new `paragraphs[]` array.
 *
 * Usage:
 *   npx tsx scripts/migrateDescriptionToParagraphs.ts [--dry-run] [--batch-size=500]
 *
 * Options:
 *   --dry-run     Preview changes without writing to Firestore
 *   --batch-size  Number of documents to process per batch (default: 500)
 */

import * as admin from 'firebase-admin';
import { ParagraphType } from '@freedi/shared-types';

// Initialize Firebase Admin
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 500;

interface MigrationStats {
  processed: number;
  migrated: number;
  skipped: number;
  errors: number;
}

/**
 * Generate a unique paragraph ID
 */
function generateParagraphId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Convert description text to paragraphs array
 */
function descriptionToParagraphs(
  description: string,
  statementId: string
): Array<{
  paragraphId: string;
  type: ParagraphType;
  content: string;
  order: number;
}> {
  if (!description || !description.trim()) return [];

  const lines = description.split('\n').filter((line) => line.trim());

  return lines.map((line, index) => ({
    paragraphId: `${statementId}-p${index}`,
    type: ParagraphType.paragraph,
    content: line.trim(),
    order: index,
  }));
}

/**
 * Process a batch of documents
 */
async function processBatch(
  docs: admin.firestore.QueryDocumentSnapshot[],
  stats: MigrationStats
): Promise<void> {
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of docs) {
    const data = doc.data();
    stats.processed++;

    // Skip if already has paragraphs
    if (data.paragraphs && data.paragraphs.length > 0) {
      stats.skipped++;
      continue;
    }

    // Skip if no description to migrate
    if (!data.description || !data.description.trim()) {
      stats.skipped++;
      continue;
    }

    try {
      // Convert description to paragraphs
      const paragraphs = descriptionToParagraphs(data.description, doc.id);

      if (paragraphs.length === 0) {
        stats.skipped++;
        continue;
      }

      // Log the migration
      console.info(`[${isDryRun ? 'DRY RUN' : 'MIGRATE'}] ${doc.id}:`);
      console.info(`  Description (${data.description.length} chars) → ${paragraphs.length} paragraphs`);

      if (!isDryRun) {
        // Update document: add paragraphs, remove description
        batch.update(doc.ref, {
          paragraphs,
          description: admin.firestore.FieldValue.delete(),
          lastUpdate: Date.now(),
        });
        batchCount++;
      }

      stats.migrated++;
    } catch (error) {
      console.error(`Error processing ${doc.id}:`, error);
      stats.errors++;
    }
  }

  // Commit batch if there are updates
  if (!isDryRun && batchCount > 0) {
    await batch.commit();
    console.info(`Committed batch of ${batchCount} updates`);
  }
}

/**
 * Main migration function
 */
async function migrateDescriptionToParagraphs(): Promise<void> {
  console.info('='.repeat(60));
  console.info('Migration: description → paragraphs');
  console.info('='.repeat(60));
  console.info(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.info(`Batch size: ${BATCH_SIZE}`);
  console.info('');

  const stats: MigrationStats = {
    processed: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Query all statements collection
    let query = db.collection('statements').orderBy('createdAt');
    let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
    let hasMore = true;

    while (hasMore) {
      // Build paginated query
      let paginatedQuery = query.limit(BATCH_SIZE);
      if (lastDoc) {
        paginatedQuery = paginatedQuery.startAfter(lastDoc);
      }

      const snapshot = await paginatedQuery.get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      console.info(`\nProcessing batch of ${snapshot.docs.length} documents...`);
      await processBatch(snapshot.docs, stats);

      // Update pagination cursor
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      // Check if we have more documents
      if (snapshot.docs.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    // Print summary
    console.info('\n' + '='.repeat(60));
    console.info('Migration Complete');
    console.info('='.repeat(60));
    console.info(`Total processed: ${stats.processed}`);
    console.info(`Migrated: ${stats.migrated}`);
    console.info(`Skipped: ${stats.skipped}`);
    console.info(`Errors: ${stats.errors}`);

    if (isDryRun) {
      console.info('\nThis was a dry run. Run without --dry-run to apply changes.');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateDescriptionToParagraphs()
  .then(() => {
    console.info('\nMigration script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
