/**
 * Client-side controller for creating/updating paragraph statements
 * Direct Firestore writes - no API routes needed
 */

import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, createParagraphChildStatement, ParagraphType, SourceApp } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

interface CreateParagraphParams {
  content: string;
  type: ParagraphType;
  order: number;
  documentId: string;
  creator: {
    uid: string;
    displayName: string;
    email: string;
    photoURL: string;
    isAnonymous: boolean;
  };
  // Image-specific fields
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
}

/**
 * Create a new paragraph as a Statement object
 * Writes directly to Firestore
 */
export async function createParagraphStatementToDB(params: CreateParagraphParams): Promise<string> {
  try {
    const firestore = getFirebaseFirestore();

    // Create a canonical paragraph child statement (statementType === paragraph).
    // `isOfficial: true` also writes the `doc.isOfficialParagraph`/`doc.order`/
    // `doc.paragraphType` mirrors so legacy Sign queries keep working during the
    // option→paragraph transition. The stable id is preserved for comment/
    // approval/evaluation linkage.
    const paragraphStatement = createParagraphChildStatement({
      content: params.content,
      host: { statementId: params.documentId, topParentId: params.documentId },
      creator: params.creator,
      creatorId: params.creator.uid,
      order: params.order,
      blockType: params.type,
      statementId: `paragraph_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      isOfficial: true,
      sourceApp: SourceApp.SIGN,
      ...(params.imageUrl && { imageUrl: params.imageUrl }),
      ...(params.imageAlt && { imageAlt: params.imageAlt }),
      ...(params.imageCaption && { imageCaption: params.imageCaption }),
    });

    if (!paragraphStatement) {
      throw new Error('Failed to create paragraph statement');
    }

    // Official paragraphs start at full consensus (matches prior behavior).
    paragraphStatement.consensus = 1.0;

    // Write to Firestore
    const statementRef = doc(firestore, Collections.statements, paragraphStatement.statementId);
    await setDoc(statementRef, paragraphStatement);

    console.info('[createParagraphStatementToDB] Paragraph created', {
      statementId: paragraphStatement.statementId,
      documentId: params.documentId,
      order: params.order,
    });

    return paragraphStatement.statementId;
  } catch (error) {
    logError(error, {
      operation: 'controllers.createParagraphStatementToDB',
      documentId: params.documentId,
    });
    throw error;
  }
}

/**
 * Update an existing paragraph statement
 */
export async function updateParagraphStatementToDB({
  paragraphId,
  content,
  type,
}: {
  paragraphId: string;
  content: string;
  type: ParagraphType;
}): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const statementRef = doc(firestore, Collections.statements, paragraphId);

    await updateDoc(statementRef, {
      statement: content,
      // Canonical top-level field + legacy `doc` mirror (transition).
      blockType: type,
      'doc.paragraphType': type,
      lastUpdate: Date.now(),
    });

    console.info('[updateParagraphStatementToDB] Paragraph updated', {
      paragraphId,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.updateParagraphStatementToDB',
      paragraphId,
    });
    throw error;
  }
}

/**
 * Update a document's title (statement field)
 */
export async function updateDocumentTitleToDB({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const statementRef = doc(firestore, Collections.statements, documentId);

    await updateDoc(statementRef, {
      statement: title,
      lastUpdate: Date.now(),
    });

    console.info('[updateDocumentTitleToDB] Document title updated', {
      documentId,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.updateDocumentTitleToDB',
      documentId,
    });
    throw error;
  }
}

/**
 * Update image-specific fields on a paragraph
 */
export async function updateParagraphImageToDB({
  paragraphId,
  imageUrl,
  imageAlt,
  imageCaption,
}: {
  paragraphId: string;
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
}): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const statementRef = doc(firestore, Collections.statements, paragraphId);

    const updateData: Record<string, unknown> = {
      lastUpdate: Date.now(),
    };

    if (imageUrl !== undefined) {
      updateData['doc.imageUrl'] = imageUrl;
    }
    if (imageAlt !== undefined) {
      updateData['doc.imageAlt'] = imageAlt;
    }
    if (imageCaption !== undefined) {
      updateData['doc.imageCaption'] = imageCaption;
    }

    await updateDoc(statementRef, updateData);

    console.info('[updateParagraphImageToDB] Paragraph image fields updated', {
      paragraphId,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.updateParagraphImageToDB',
      paragraphId,
    });
    throw error;
  }
}

/**
 * Bulk delete (hide) multiple paragraph statements using batched writes
 */
export async function bulkDeleteParagraphStatementsToDB(paragraphIds: string[]): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const now = Date.now();
    const { writeBatch } = await import('firebase/firestore');

    // Firestore batch limit is 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < paragraphIds.length; i += BATCH_SIZE) {
      const chunk = paragraphIds.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestore);

      for (const id of chunk) {
        const ref = doc(firestore, Collections.statements, id);
        batch.update(ref, { hide: true, lastUpdate: now });
      }

      await batch.commit();
    }

    console.info('[bulkDeleteParagraphStatementsToDB] Bulk deleted paragraphs', {
      count: paragraphIds.length,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.bulkDeleteParagraphStatementsToDB',
      metadata: { count: paragraphIds.length },
    });
    throw error;
  }
}

/**
 * Batch-update paragraph order values in Firestore
 */
export async function reorderParagraphsToDB(
  paragraphOrders: Array<{ paragraphId: string; order: number }>
): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const { writeBatch } = await import('firebase/firestore');
    const now = Date.now();

    const BATCH_SIZE = 500;
    for (let i = 0; i < paragraphOrders.length; i += BATCH_SIZE) {
      const chunk = paragraphOrders.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestore);

      for (const { paragraphId, order } of chunk) {
        const ref = doc(firestore, Collections.statements, paragraphId);
        // Canonical top-level `order` + legacy `doc.order` mirror (transition).
        batch.update(ref, { order, 'doc.order': order, lastUpdate: now });
      }

      await batch.commit();
    }

    console.info('[reorderParagraphsToDB] Paragraphs reordered', {
      count: paragraphOrders.length,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.reorderParagraphsToDB',
      metadata: { count: paragraphOrders.length },
    });
    throw error;
  }
}

/**
 * Delete (hide) a paragraph statement
 */
export async function deleteParagraphStatementToDB(paragraphId: string): Promise<void> {
  try {
    const firestore = getFirebaseFirestore();
    const statementRef = doc(firestore, Collections.statements, paragraphId);

    // Soft delete by marking as hidden
    await updateDoc(statementRef, {
      hide: true,
      lastUpdate: Date.now(),
    });

    console.info('[deleteParagraphStatementToDB] Paragraph hidden', {
      paragraphId,
    });
  } catch (error) {
    logError(error, {
      operation: 'controllers.deleteParagraphStatementToDB',
      paragraphId,
    });
    throw error;
  }
}
