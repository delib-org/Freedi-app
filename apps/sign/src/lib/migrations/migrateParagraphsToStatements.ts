/**
 * Migration utility to convert embedded paragraph arrays to statement-based paragraphs
 *
 * This migration runs automatically on first document load (lazy migration).
 * It converts each paragraph in a document from an embedded array to a separate
 * Statement document marked as an "official paragraph".
 */

import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { createParagraphStatement } from '@freedi/shared-types';
import { User, Statement, Collections } from '@freedi/shared-types';
import { logError, DatabaseError } from '@/lib/utils/errorHandling';

/**
 * Maximum batch size for Firestore batch writes
 */
const FIRESTORE_BATCH_SIZE = 500;

/**
 * System user for migration operations
 * Used when no specific user is available
 */
const SYSTEM_USER: User = {
  uid: 'system',
  displayName: 'System',
  email: '',
  photoURL: '',
  isAnonymous: true,
};

/**
 * Check if a document has already been migrated to statement-based paragraphs
 *
 * @param documentId - The document to check
 * @returns True if already migrated (has official paragraph statements)
 */
export async function checkIfMigrated(documentId: string): Promise<boolean> {
  try {
    const db = getFirestoreAdmin();

    // Query for official paragraphs for this document
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', documentId)
      .where('doc.isOfficialParagraph', '==', true)
      .limit(1)
      .get();

    return !snapshot.empty;
  } catch (error) {
    logError(error, {
      operation: 'migration.checkIfMigrated',
      documentId,
    });
    throw new DatabaseError('Failed to check migration status', { documentId });
  }
}

/**
 * Migrate paragraphs from embedded array to statement-based documents
 *
 * This function is idempotent - it checks if migration has already occurred
 * before performing the migration.
 *
 * @param documentId - The document to migrate
 * @param userId - The user performing the migration (defaults to system user)
 * @returns Number of paragraphs migrated
 *
 * @example
 * const count = await migrateParagraphsToStatements('doc_123', 'user_456');
 * console.log(`Migrated ${count} paragraphs`);
 */
export async function migrateParagraphsToStatements(
  documentId: string,
  userId: string = 'system'
): Promise<number> {
  try {
    const db = getFirestoreAdmin();

    // Check if already migrated
    const alreadyMigrated = await checkIfMigrated(documentId);
    if (alreadyMigrated) {
      console.info('[Migration] Document already migrated', { documentId });
      return 0;
    }

    // Get the document
    const docRef = db.collection(Collections.statements).doc(documentId);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      throw new DatabaseError('Document not found', { documentId });
    }

    const docData = docSnapshot.data() as Statement;

    // Check if document has paragraphs to migrate
    if (!docData.paragraphs || docData.paragraphs.length === 0) {
      console.info('[Migration] No paragraphs to migrate', { documentId });
      return 0;
    }

    // Get user info for creator field
    let creator: User = SYSTEM_USER;
    if (userId !== 'system') {
      try {
        const userSnapshot = await db.collection(Collections.users).doc(userId).get();
        if (userSnapshot.exists) {
          const userData = userSnapshot.data();
          creator = {
            uid: userId,
            displayName: userData?.displayName || 'Unknown',
            email: userData?.email || '',
            photoURL: userData?.photoURL || '',
            isAnonymous: false,
          };
        }
      } catch (error) {
        logError(error, {
          operation: 'migration.getUserInfo',
          userId,
          metadata: { fallbackToSystem: true },
        });
        // Continue with system user
      }
    }

    // Convert paragraphs to statements
    const paragraphStatements: Statement[] = [];
    for (const paragraph of docData.paragraphs) {
      const statement = createParagraphStatement(paragraph, documentId, creator);
      if (statement) {
        paragraphStatements.push(statement);
      }
    }

    if (paragraphStatements.length === 0) {
      console.info('[Migration] No valid paragraphs to create', { documentId });
      return 0;
    }

    // Write in batches (max 500 per batch)
    await writeParagraphStatementsInBatches(paragraphStatements);

    console.info('[Migration] Successfully migrated paragraphs to statements', {
      documentId,
      count: paragraphStatements.length,
    });

    return paragraphStatements.length;
  } catch (error) {
    logError(error, {
      operation: 'migration.migrateParagraphsToStatements',
      documentId,
      userId,
    });
    throw new DatabaseError('Migration failed', { documentId });
  }
}

/**
 * Write paragraph statements to Firestore in batches
 * Handles automatic batching for the 500-document limit
 *
 * @param statements - Array of statements to write
 */
async function writeParagraphStatementsInBatches(statements: Statement[]): Promise<void> {
  const db = getFirestoreAdmin();

  // Split into batches of 500
  const batches: Statement[][] = [];
  for (let i = 0; i < statements.length; i += FIRESTORE_BATCH_SIZE) {
    batches.push(statements.slice(i, i + FIRESTORE_BATCH_SIZE));
  }

  // Execute each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = db.batch();
    const currentBatch = batches[batchIndex]!;

    for (const statement of currentBatch) {
      const ref = db.collection(Collections.statements).doc(statement.statementId);
      batch.set(ref, statement);
    }

    await batch.commit();

    console.info('[Migration] Batch committed', {
      batchIndex: batchIndex + 1,
      totalBatches: batches.length,
      statementsInBatch: currentBatch.length,
    });
  }
}

/**
 * Migrate multiple documents in parallel
 *
 * @param documentIds - Array of document IDs to migrate
 * @param userId - The user performing the migration
 * @returns Total number of paragraphs migrated across all documents
 */
export async function migrateBulkDocuments(
  documentIds: string[],
  userId: string = 'system'
): Promise<number> {
  try {
    const results = await Promise.allSettled(
      documentIds.map((docId) => migrateParagraphsToStatements(docId, userId))
    );

    let totalMigrated = 0;
    let failed = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'fulfilled') {
        totalMigrated += result.value;
      } else {
        failed++;
        logError(result.reason, {
          operation: 'migration.migrateBulkDocuments',
          documentId: documentIds[i],
        });
      }
    }

    console.info('[Migration] Bulk migration complete', {
      total: documentIds.length,
      migrated: totalMigrated,
      failed,
    });

    return totalMigrated;
  } catch (error) {
    logError(error, {
      operation: 'migration.migrateBulkDocuments',
      metadata: { documentCount: documentIds.length },
    });
    throw error;
  }
}
