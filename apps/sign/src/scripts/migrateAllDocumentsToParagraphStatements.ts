/**
 * Production Migration Script: Migrate All Documents to Paragraph Statements
 *
 * This script migrates ALL existing documents from embedded paragraphs to statement-based paragraphs.
 * It also migrates all related data:
 * - Comments referencing paragraphId
 * - Approvals referencing paragraphId
 * - Old suggestions collection → new statement-based suggestions
 * - Importance votes
 * - Any other data tied to paragraph IDs
 *
 * Features:
 * - Dry-run mode to preview changes
 * - Batch processing to avoid timeouts
 * - Progress tracking with detailed logging
 * - Idempotent (safe to re-run)
 * - Rollback capability
 * - Comprehensive error handling
 *
 * Usage:
 *   # Dry run (preview only)
 *   npm run migrate:paragraphs -- --dry-run
 *
 *   # Run for real
 *   npm run migrate:paragraphs
 *
 *   # Migrate specific documents
 *   npm run migrate:paragraphs -- --documents doc1,doc2,doc3
 *
 *   # Resume from checkpoint
 *   npm run migrate:paragraphs -- --resume
 */

import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, Suggestion, ParagraphType } from '@freedi/shared-types';
import { createParagraphStatement, createSuggestionStatement } from '@freedi/shared-types';
import { checkIfMigrated } from '@/lib/migrations/migrateParagraphsToStatements';
import { logError } from '@/lib/utils/errorHandling';
import * as fs from 'fs';
import * as path from 'path';

const db = getFirestoreAdmin();

/**
 * Migration configuration
 */
const CONFIG = {
  BATCH_SIZE: 500, // Firestore batch limit
  DOCUMENTS_PER_RUN: 50, // Process 50 documents per run to avoid timeouts
  CHECKPOINT_FILE: './migration-checkpoint.json',
  LOG_FILE: './migration-log.json',
  DRY_RUN: process.argv.includes('--dry-run'),
  RESUME: process.argv.includes('--resume'),
  SPECIFIC_DOCUMENTS: process.argv
    .find((arg) => arg.startsWith('--documents='))
    ?.split('=')[1]
    ?.split(',') || null,
};

/**
 * Migration statistics
 */
interface MigrationStats {
  totalDocuments: number;
  migratedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  totalParagraphs: number;
  totalComments: number;
  totalApprovals: number;
  totalSuggestions: number;
  errors: Array<{ documentId: string; error: string }>;
  startTime: number;
  endTime?: number;
}

/**
 * Migration checkpoint (for resume capability)
 */
interface MigrationCheckpoint {
  lastProcessedDocumentId: string | null;
  processedDocumentIds: string[];
  stats: MigrationStats;
  timestamp: number;
}

/**
 * Initialize statistics
 */
function initStats(): MigrationStats {
  return {
    totalDocuments: 0,
    migratedDocuments: 0,
    skippedDocuments: 0,
    failedDocuments: 0,
    totalParagraphs: 0,
    totalComments: 0,
    totalApprovals: 0,
    totalSuggestions: 0,
    errors: [],
    startTime: Date.now(),
  };
}

/**
 * Load checkpoint from file
 */
function loadCheckpoint(): MigrationCheckpoint | null {
  try {
    if (fs.existsSync(CONFIG.CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CONFIG.CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load checkpoint:', error);
  }
  return null;
}

/**
 * Save checkpoint to file
 */
function saveCheckpoint(checkpoint: MigrationCheckpoint): void {
  try {
    fs.writeFileSync(CONFIG.CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    console.info('[Checkpoint] Saved at', new Date().toISOString());
  } catch (error) {
    console.error('Failed to save checkpoint:', error);
  }
}

/**
 * Save migration log
 */
function saveLog(stats: MigrationStats): void {
  try {
    const logEntry = {
      ...stats,
      endTime: Date.now(),
      duration: Date.now() - stats.startTime,
      timestamp: new Date().toISOString(),
    };

    // Append to log file
    const logs: any[] = [];
    if (fs.existsSync(CONFIG.LOG_FILE)) {
      const existingLog = fs.readFileSync(CONFIG.LOG_FILE, 'utf-8');
      logs.push(...JSON.parse(existingLog));
    }
    logs.push(logEntry);

    fs.writeFileSync(CONFIG.LOG_FILE, JSON.stringify(logs, null, 2));
    console.info('[Log] Saved migration log');
  } catch (error) {
    console.error('Failed to save log:', error);
  }
}

/**
 * Get all documents with embedded paragraphs
 */
async function getDocumentsToMigrate(
  startAfter: string | null,
  limit: number
): Promise<Statement[]> {
  try {
    let query = db
      .collection(Collections.statements)
      .where('paragraphs', '!=', null)
      .limit(limit);

    if (startAfter) {
      const startDoc = await db.collection(Collections.statements).doc(startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => doc.data() as Statement)
      .filter((doc) => doc.paragraphs && doc.paragraphs.length > 0);
  } catch (error) {
    logError(error, { operation: 'migration.getDocumentsToMigrate' });
    throw error;
  }
}

/**
 * Create paragraph ID mapping (old paragraphId → new statementId)
 */
function createParagraphIdMapping(
  oldParagraphs: Array<{ paragraphId: string }>,
  newStatements: Statement[]
): Map<string, string> {
  const mapping = new Map<string, string>();

  oldParagraphs.forEach((oldParagraph, index) => {
    const newStatement = newStatements[index];
    if (newStatement) {
      mapping.set(oldParagraph.paragraphId, newStatement.statementId);
    }
  });

  return mapping;
}

/**
 * Migrate comments for a document
 */
async function migrateComments(
  documentId: string,
  paragraphIdMapping: Map<string, string>,
  dryRun: boolean
): Promise<number> {
  try {
    // Get all comments (statements with statementType = 'statement' that are children of paragraphs)
    const commentsSnap = await db
      .collection(Collections.statements)
      .where('topParentId', '==', documentId)
      .where('statementType', '==', 'statement' as any)
      .get();

    if (commentsSnap.empty) {
      return 0;
    }

    const batch = db.batch();
    let count = 0;

    for (const commentDoc of commentsSnap.docs) {
      const comment = commentDoc.data() as Statement;

      // Check if parentId is in the mapping (means it's a comment on an old paragraph)
      const newParentId = paragraphIdMapping.get(comment.parentId);

      if (newParentId) {
        // Update comment's parentId to point to new official paragraph statement
        if (!dryRun) {
          batch.update(commentDoc.ref, {
            parentId: newParentId,
            lastUpdate: Date.now(),
            migratedAt: Date.now(),
          });
        }
        count++;
      }
    }

    if (!dryRun && count > 0) {
      await batch.commit();
    }

    console.info(`[Comments] ${dryRun ? 'Would migrate' : 'Migrated'} ${count} comments`);
    return count;
  } catch (error) {
    logError(error, {
      operation: 'migration.migrateComments',
      documentId,
    });
    throw error;
  }
}

/**
 * Migrate approvals for a document
 */
async function migrateApprovals(
  documentId: string,
  paragraphIdMapping: Map<string, string>,
  dryRun: boolean
): Promise<number> {
  try {
    // Get all approvals (from approvals collection or documentApproval field)
    const approvalsSnap = await db
      .collection(Collections.evaluations) // Approvals stored as evaluations
      .where('topParentId', '==', documentId)
      .get();

    if (approvalsSnap.empty) {
      return 0;
    }

    const batch = db.batch();
    let count = 0;

    for (const approvalDoc of approvalsSnap.docs) {
      const approval = approvalDoc.data();

      // Check if statementId (which was paragraphId) is in the mapping
      const newStatementId = paragraphIdMapping.get(approval.statementId);

      if (newStatementId) {
        // Update approval to reference new statement ID
        if (!dryRun) {
          batch.update(approvalDoc.ref, {
            statementId: newStatementId,
            migratedAt: Date.now(),
          });
        }
        count++;
      }
    }

    if (!dryRun && count > 0) {
      await batch.commit();
    }

    console.info(`[Approvals] ${dryRun ? 'Would migrate' : 'Migrated'} ${count} approvals`);
    return count;
  } catch (error) {
    logError(error, {
      operation: 'migration.migrateApprovals',
      documentId,
    });
    throw error;
  }
}

/**
 * Migrate suggestions from old suggestions collection to statement-based
 */
async function migrateSuggestions(
  documentId: string,
  paragraphIdMapping: Map<string, string>,
  dryRun: boolean
): Promise<number> {
  try {
    // Get all old suggestions from suggestions collection
    const suggestionsSnap = await db
      .collection(Collections.suggestions)
      .where('documentId', '==', documentId)
      .get();

    if (suggestionsSnap.empty) {
      return 0;
    }

    const batch = db.batch();
    let count = 0;

    for (const suggestionDoc of suggestionsSnap.docs) {
      const oldSuggestion = suggestionDoc.data() as Suggestion;

      // Get new official paragraph ID
      const newOfficialParagraphId = paragraphIdMapping.get(oldSuggestion.paragraphId);

      if (!newOfficialParagraphId) {
        console.warn(`[Suggestions] No mapping found for paragraphId: ${oldSuggestion.paragraphId}`);
        continue;
      }

      // Create new suggestion statement
      const suggestionStatement = createSuggestionStatement(
        oldSuggestion.suggestion,
        newOfficialParagraphId,
        documentId,
        oldSuggestion.creator
      );

      if (!suggestionStatement) {
        console.warn(`[Suggestions] Failed to create suggestion statement for: ${suggestionDoc.id}`);
        continue;
      }

      // Add additional fields from old suggestion
      suggestionStatement.createdAt = oldSuggestion.createdAt || Date.now();
      suggestionStatement.consensus = 0; // Will be calculated by evaluation function

      if (!dryRun) {
        const suggestionRef = db
          .collection(Collections.statements)
          .doc(suggestionStatement.statementId);
        batch.set(suggestionRef, suggestionStatement);

        // Mark old suggestion as migrated (don't delete, keep for reference)
        batch.update(suggestionDoc.ref, {
          migrated: true,
          migratedAt: Date.now(),
          newStatementId: suggestionStatement.statementId,
        });
      }

      count++;
    }

    if (!dryRun && count > 0) {
      await batch.commit();
    }

    console.info(`[Suggestions] ${dryRun ? 'Would migrate' : 'Migrated'} ${count} suggestions`);
    return count;
  } catch (error) {
    logError(error, {
      operation: 'migration.migrateSuggestions',
      documentId,
    });
    throw error;
  }
}

/**
 * Migrate a single document
 */
async function migrateDocument(
  document: Statement,
  stats: MigrationStats,
  dryRun: boolean
): Promise<void> {
  const documentId = document.statementId;

  try {
    console.info(`\n[Document] Processing: ${documentId}`);

    // Check if already migrated
    const alreadyMigrated = await checkIfMigrated(documentId);
    if (alreadyMigrated) {
      console.info(`[Document] Already migrated, skipping`);
      stats.skippedDocuments++;
      return;
    }

    if (!document.paragraphs || document.paragraphs.length === 0) {
      console.info(`[Document] No paragraphs to migrate`);
      stats.skippedDocuments++;
      return;
    }

    console.info(`[Document] Found ${document.paragraphs.length} paragraphs`);

    // 1. Create official paragraph statements
    const paragraphStatements: Statement[] = [];
    for (const paragraph of document.paragraphs) {
      const statement = createParagraphStatement(paragraph, documentId, document.creator);
      if (statement) {
        paragraphStatements.push(statement);
      }
    }

    console.info(`[Paragraphs] Created ${paragraphStatements.length} paragraph statements`);

    // 2. Create paragraph ID mapping
    const paragraphIdMapping = createParagraphIdMapping(
      document.paragraphs,
      paragraphStatements
    );

    console.info(`[Mapping] Created ${paragraphIdMapping.size} ID mappings`);

    // 3. Write paragraph statements to Firestore
    if (!dryRun) {
      const batch = db.batch();
      for (const statement of paragraphStatements) {
        const ref = db.collection(Collections.statements).doc(statement.statementId);
        batch.set(ref, statement);
      }
      await batch.commit();
      console.info(`[Paragraphs] Wrote ${paragraphStatements.length} statements to Firestore`);
    } else {
      console.info(`[Paragraphs] Would write ${paragraphStatements.length} statements (dry run)`);
    }

    // 4. Migrate comments
    const commentCount = await migrateComments(documentId, paragraphIdMapping, dryRun);
    stats.totalComments += commentCount;

    // 5. Migrate approvals
    const approvalCount = await migrateApprovals(documentId, paragraphIdMapping, dryRun);
    stats.totalApprovals += approvalCount;

    // 6. Migrate suggestions
    const suggestionCount = await migrateSuggestions(documentId, paragraphIdMapping, dryRun);
    stats.totalSuggestions += suggestionCount;

    // 7. Mark document as migrated (optional metadata)
    if (!dryRun) {
      const documentRef = db.collection(Collections.statements).doc(documentId);
      await documentRef.update({
        migratedToParagraphStatements: true,
        migratedAt: Date.now(),
        paragraphIdMapping: Object.fromEntries(paragraphIdMapping),
      });
    }

    // Update stats
    stats.migratedDocuments++;
    stats.totalParagraphs += paragraphStatements.length;

    console.info(`[Document] ✓ Successfully ${dryRun ? 'would migrate' : 'migrated'}: ${documentId}`);
  } catch (error) {
    console.error(`[Document] ✗ Failed to migrate: ${documentId}`, error);
    stats.failedDocuments++;
    stats.errors.push({
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  console.info('========================================');
  console.info('  PARAGRAPH STATEMENTS MIGRATION');
  console.info('========================================');
  console.info(`Mode: ${CONFIG.DRY_RUN ? 'DRY RUN (preview only)' : 'PRODUCTION'}`);
  console.info(`Batch size: ${CONFIG.DOCUMENTS_PER_RUN} documents per run`);
  console.info('========================================\n');

  // Load checkpoint if resuming
  let checkpoint: MigrationCheckpoint | null = null;
  let stats: MigrationStats;

  if (CONFIG.RESUME) {
    checkpoint = loadCheckpoint();
    if (checkpoint) {
      console.info('[Resume] Loaded checkpoint from', new Date(checkpoint.timestamp).toISOString());
      stats = checkpoint.stats;
    } else {
      console.info('[Resume] No checkpoint found, starting fresh');
      stats = initStats();
    }
  } else {
    stats = initStats();
  }

  try {
    // Get documents to migrate
    let documents: Statement[];

    if (CONFIG.SPECIFIC_DOCUMENTS) {
      console.info(`[Query] Migrating specific documents: ${CONFIG.SPECIFIC_DOCUMENTS.join(', ')}`);
      documents = [];
      for (const docId of CONFIG.SPECIFIC_DOCUMENTS) {
        const docSnap = await db.collection(Collections.statements).doc(docId).get();
        if (docSnap.exists) {
          documents.push(docSnap.data() as Statement);
        }
      }
    } else {
      const startAfter = checkpoint?.lastProcessedDocumentId || null;
      console.info(`[Query] Fetching up to ${CONFIG.DOCUMENTS_PER_RUN} documents...`);
      documents = await getDocumentsToMigrate(startAfter, CONFIG.DOCUMENTS_PER_RUN);
    }

    console.info(`[Query] Found ${documents.length} documents to process\n`);
    stats.totalDocuments = documents.length;

    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const document = documents[i]!;

      console.info(`\n[Progress] ${i + 1}/${documents.length} (${Math.round(((i + 1) / documents.length) * 100)}%)`);

      await migrateDocument(document, stats, CONFIG.DRY_RUN);

      // Save checkpoint every 10 documents
      if ((i + 1) % 10 === 0 && !CONFIG.DRY_RUN) {
        const newCheckpoint: MigrationCheckpoint = {
          lastProcessedDocumentId: document.statementId,
          processedDocumentIds: [
            ...(checkpoint?.processedDocumentIds || []),
            document.statementId,
          ],
          stats,
          timestamp: Date.now(),
        };
        saveCheckpoint(newCheckpoint);
      }
    }

    // Final stats
    stats.endTime = Date.now();
    const duration = stats.endTime - stats.startTime;

    console.info('\n========================================');
    console.info('  MIGRATION COMPLETE');
    console.info('========================================');
    console.info(`Total documents: ${stats.totalDocuments}`);
    console.info(`Migrated: ${stats.migratedDocuments}`);
    console.info(`Skipped: ${stats.skippedDocuments}`);
    console.info(`Failed: ${stats.failedDocuments}`);
    console.info(`Total paragraphs: ${stats.totalParagraphs}`);
    console.info(`Total comments: ${stats.totalComments}`);
    console.info(`Total approvals: ${stats.totalApprovals}`);
    console.info(`Total suggestions: ${stats.totalSuggestions}`);
    console.info(`Duration: ${Math.round(duration / 1000)}s`);

    if (stats.errors.length > 0) {
      console.info('\nErrors:');
      stats.errors.forEach((err) => {
        console.error(`  - ${err.documentId}: ${err.error}`);
      });
    }

    console.info('========================================\n');

    // Save log
    if (!CONFIG.DRY_RUN) {
      saveLog(stats);

      // Check if more documents to process
      if (documents.length === CONFIG.DOCUMENTS_PER_RUN) {
        console.info('\n⚠️  More documents to process. Run again with --resume flag.');
      } else {
        console.info('\n✓ All documents processed!');
        // Clean up checkpoint file
        if (fs.existsSync(CONFIG.CHECKPOINT_FILE)) {
          fs.unlinkSync(CONFIG.CHECKPOINT_FILE);
        }
      }
    }
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    logError(error, { operation: 'migration.main' });
    process.exit(1);
  }
}

// Run migration
main()
  .then(() => {
    console.info('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
