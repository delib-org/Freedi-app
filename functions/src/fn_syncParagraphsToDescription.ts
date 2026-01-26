/**
 * Firebase Function: Sync Paragraphs to Description
 *
 * Firestore trigger that runs when official paragraph text updates.
 * Aggregates all official paragraphs → document description field.
 * All clients viewing parent document update instantly via Firestore listeners.
 *
 * Flow:
 * 1. Paragraph text updates (via finalization or auto-update)
 * 2. This function triggers
 * 3. Query all official paragraphs for document (ordered)
 * 4. Aggregate text with markdown formatting (headers, lists, etc.)
 * 5. Update parent document's `statement` field (description)
 * 6. All clients receive update via Firestore listeners (real-time)
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Statement, Collections, ParagraphType } from '@freedi/shared-types';

const db = getFirestore();

/**
 * Maximum description length in characters
 * Prevents excessively long descriptions
 */
const MAX_DESCRIPTION_LENGTH = 5000;

/**
 * Firestore trigger: Runs when official paragraph statement field updates
 */
export const fn_syncParagraphsToDescription = functions.firestore
  .document(`${Collections.statements}/{statementId}`)
  .onUpdate(async (change, context) => {
    const statementId = context.params.statementId;
    const beforeData = change.before.data() as Statement;
    const afterData = change.after.data() as Statement;

    try {
      // Only process if statement text changed
      if (beforeData.statement === afterData.statement) {
        return null;
      }

      // Only process official paragraphs
      if (!afterData.doc?.isOfficialParagraph) {
        return null;
      }

      const documentId = afterData.parentId;
      if (!documentId) {
        return null;
      }

      // Get all official paragraphs for this document (ordered)
      const officialParagraphsSnap = await db
        .collection(Collections.statements)
        .where('parentId', '==', documentId)
        .where('doc.isOfficialParagraph', '==', true)
        .orderBy('doc.order', 'asc')
        .get();

      if (officialParagraphsSnap.empty) {
        console.warn('[fn_syncParagraphsToDescription] No official paragraphs found', {
          documentId,
        });
        return null;
      }

      // Aggregate paragraphs into description text
      const paragraphTexts: string[] = [];
      let totalLength = 0;

      for (const doc of officialParagraphsSnap.docs) {
        const paragraph = doc.data() as Statement;

        // Format based on paragraph type (headers, lists, etc.)
        const formatted = formatParagraphText(paragraph);

        // Check if adding this would exceed limit
        if (totalLength + formatted.length > MAX_DESCRIPTION_LENGTH) {
          paragraphTexts.push('...[truncated]');
          break;
        }

        paragraphTexts.push(formatted);
        totalLength += formatted.length;
      }

      const description = paragraphTexts.join('\n\n');

      // Update parent document's statement field
      const documentRef = db.collection(Collections.statements).doc(documentId);
      await documentRef.update({
        statement: description,
        lastUpdate: FieldValue.serverTimestamp(),
        lastChildUpdate: FieldValue.serverTimestamp(),
        // Track sync metadata
        syncedFromParagraphs: true,
        syncedAt: FieldValue.serverTimestamp(),
        paragraphCount: officialParagraphsSnap.size,
      });

      console.info('[fn_syncParagraphsToDescription] Synced paragraphs to description', {
        documentId,
        paragraphCount: officialParagraphsSnap.size,
        descriptionLength: description.length,
      });

      return null;
    } catch (error) {
      console.error('[fn_syncParagraphsToDescription] Error', error, {
        statementId,
      });
      return null;
    }
  });

/**
 * Format paragraph text based on type (headers, lists, etc.)
 *
 * @param paragraph - The paragraph statement
 * @returns Formatted text with markdown
 */
function formatParagraphText(paragraph: Statement): string {
  const text = paragraph.statement;

  // Get paragraph type from doc field or infer from statement
  // For now, just return plain text - can be enhanced later
  // TODO: Infer paragraph type from doc field and format accordingly
  // - h1-h6: Add markdown headers (## Header)
  // - li: Add bullet points (- Item)
  // - table: Format as markdown table
  // - image: Add image markdown (![alt](url))

  return text;
}

/**
 * Helper function to manually trigger sync for a document
 * Useful for admin tools or bulk operations
 */
export const triggerParagraphSync = functions.https.onCall(async (data, context) => {
  const { documentId } = data;

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  if (!documentId) {
    throw new functions.https.HttpsError('invalid-argument', 'documentId is required');
  }

  try {
    // Get all official paragraphs
    const officialParagraphsSnap = await db
      .collection(Collections.statements)
      .where('parentId', '==', documentId)
      .where('doc.isOfficialParagraph', '==', true)
      .orderBy('doc.order', 'asc')
      .get();

    if (officialParagraphsSnap.empty) {
      return { success: false, message: 'No official paragraphs found' };
    }

    const paragraphTexts: string[] = [];
    let totalLength = 0;

    for (const doc of officialParagraphsSnap.docs) {
      const paragraph = doc.data() as Statement;
      const formatted = formatParagraphText(paragraph);

      if (totalLength + formatted.length > MAX_DESCRIPTION_LENGTH) {
        paragraphTexts.push('...[truncated]');
        break;
      }

      paragraphTexts.push(formatted);
      totalLength += formatted.length;
    }

    const description = paragraphTexts.join('\n\n');

    // Update document
    const documentRef = db.collection(Collections.statements).doc(documentId);
    await documentRef.update({
      statement: description,
      lastUpdate: FieldValue.serverTimestamp(),
      syncedFromParagraphs: true,
      syncedAt: FieldValue.serverTimestamp(),
      paragraphCount: officialParagraphsSnap.size,
    });

    return {
      success: true,
      paragraphCount: officialParagraphsSnap.size,
      descriptionLength: description.length,
    };
  } catch (error) {
    console.error('[triggerParagraphSync] Error', error, { documentId });
    throw new functions.https.HttpsError('internal', 'Failed to sync paragraphs');
  }
});
