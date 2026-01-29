/**
 * Firebase Function: Update Official Paragraph Text
 *
 * Triggered when a suggestion's evaluation changes (via fn_evaluation.ts update).
 * Checks if the suggestion has highest consensus and updates official paragraph text.
 * Only runs in 'auto' mode - manual/deadline modes handled separately.
 *
 * Flow:
 * 1. User votes on suggestion -> fn_evaluation updates consensus
 * 2. This function triggers on suggestion consensus change
 * 3. Check document suggestion settings mode
 * 4. If 'auto' mode: Update official paragraph text to winning suggestion
 * 5. All clients receive update via Firestore listeners (real-time)
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Statement, Collections } from '@freedi/shared-types';

const db = getFirestore();

/**
 * Firestore trigger: Runs when statement consensus field updates
 * Only processes suggestions (not official paragraphs)
 */
export const fn_updateOfficialParagraphText = functions.firestore
  .document(`${Collections.statements}/{statementId}`)
  .onUpdate(async (change, context) => {
    const statementId = context.params.statementId;
    const beforeData = change.before.data() as Statement;
    const afterData = change.after.data() as Statement;

    try {
      // Only process if consensus changed
      if (beforeData.consensus === afterData.consensus) {
        return null;
      }

      // Only process suggestions (not official paragraphs)
      if (afterData.doc?.isOfficialParagraph) {
        return null;
      }

      // Must have a parent (official paragraph ID)
      const officialParagraphId = afterData.parentId;
      if (!officialParagraphId) {
        return null;
      }

      // Get the official paragraph
      const officialParagraphRef = db.collection(Collections.statements).doc(officialParagraphId);
      const officialParagraphSnap = await officialParagraphRef.get();

      if (!officialParagraphSnap.exists) {
        console.warn('[fn_updateOfficialParagraphText] Official paragraph not found', {
          officialParagraphId,
          suggestionId: statementId,
        });
        return null;
      }

      const officialParagraph = officialParagraphSnap.data() as Statement;

      // Get document to check suggestion settings
      const documentId = afterData.topParentId;
      const documentRef = db.collection(Collections.statements).doc(documentId);
      const documentSnap = await documentRef.get();

      if (!documentSnap.exists) {
        console.warn('[fn_updateOfficialParagraphText] Document not found', {
          documentId,
        });
        return null;
      }

      const document = documentSnap.data() as Statement;

      // Check suggestion settings mode
      const suggestionSettings = document.doc?.suggestionSettings;
      const mode = suggestionSettings?.mode || 'manual'; // Default to manual

      // Only proceed if mode is 'auto'
      if (mode !== 'auto') {
        console.info('[fn_updateOfficialParagraphText] Skipping - not auto mode', {
          mode,
          documentId,
        });
        return null;
      }

      // Get all suggestions for this paragraph
      const suggestionsSnap = await db
        .collection(Collections.statements)
        .where('parentId', '==', officialParagraphId)
        .where('statementType', '==', afterData.statementType)
        .orderBy('consensus', 'desc')
        .limit(1)
        .get();

      if (suggestionsSnap.empty) {
        return null;
      }

      const winningSuggestion = suggestionsSnap.docs[0]!.data() as Statement;

      // Only update if winning suggestion has higher consensus than official
      if (winningSuggestion.consensus <= officialParagraph.consensus) {
        console.info('[fn_updateOfficialParagraphText] Winning suggestion not higher', {
          winningConsensus: winningSuggestion.consensus,
          officialConsensus: officialParagraph.consensus,
        });
        return null;
      }

      // Update official paragraph text to winning suggestion
      await officialParagraphRef.update({
        statement: winningSuggestion.statement,
        lastUpdate: FieldValue.serverTimestamp(),
        // Optionally track which suggestion was applied
        appliedSuggestionId: winningSuggestion.statementId,
        appliedAt: FieldValue.serverTimestamp(),
      });

      console.info('[fn_updateOfficialParagraphText] Updated official paragraph text', {
        officialParagraphId,
        winningSuggestionId: winningSuggestion.statementId,
        newText: winningSuggestion.statement,
        consensus: winningSuggestion.consensus,
      });

      // Create version history entry (preserve old text as a suggestion)
      // This allows reverting if needed
      const historyEntry = {
        statementId: `history_${Date.now()}`,
        statement: officialParagraph.statement, // Old text
        statementType: afterData.statementType,
        parentId: officialParagraphId,
        topParentId: documentId,
        creatorId: officialParagraph.creatorId,
        creator: officialParagraph.creator,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: officialParagraph.consensus,
        hide: true, // Hidden history entry
        replacedBy: winningSuggestion.statementId,
        replacedAt: Date.now(),
      };

      await db.collection(Collections.statements).doc(historyEntry.statementId).set(historyEntry);

      return null;
    } catch (error) {
      console.error('[fn_updateOfficialParagraphText] Error', error, {
        statementId,
      });
      return null;
    }
  });
