/**
 * Client-side controller for creating/updating paragraph statements
 * Direct Firestore writes - no API routes needed
 */

import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, createParagraphStatement, ParagraphType } from '@freedi/shared-types';
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
}

/**
 * Create a new paragraph as a Statement object
 * Writes directly to Firestore
 */
export async function createParagraphStatementToDB(params: CreateParagraphParams): Promise<string> {
  try {
    const firestore = getFirebaseFirestore();

    // Create the paragraph statement object
    const paragraphStatement = createParagraphStatement(
      params.content,
      params.type,
      params.order,
      params.documentId,
      params.creator
    );

    if (!paragraphStatement) {
      throw new Error('Failed to create paragraph statement');
    }

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
      'doc.type': type,
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
