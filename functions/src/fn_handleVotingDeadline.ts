/**
 * Firebase Function: Handle Voting Deadline
 *
 * Scheduled function that runs every hour to check for documents with expired voting deadlines.
 * Auto-finalizes winning suggestions when deadline passes.
 *
 * Flow:
 * 1. Query documents with votingDeadline < now and not finalized
 * 2. For each document, get all official paragraphs
 * 3. For each paragraph, get winning suggestion
 * 4. Finalize winning suggestion (update official paragraph text)
 * 5. Send notifications to participants
 */

import * as functions from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Statement, Collections } from '@freedi/shared-types';

const db = getFirestore();

/**
 * Scheduled function: Runs every hour
 * Checks for expired voting deadlines and auto-finalizes suggestions
 */
export const fn_handleVotingDeadline = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const now = Date.now();

      // Query documents with expired deadlines
      const documentsSnap = await db
        .collection(Collections.statements)
        .where('doc.suggestionSettings.mode', '==', 'deadline')
        .where('doc.suggestionSettings.votingDeadline', '<', now)
        .where('doc.suggestionSettings.finalized', '!=', true)
        .get();

      if (documentsSnap.empty) {
        console.info('[fn_handleVotingDeadline] No expired deadlines found');
        return null;
      }

      console.info('[fn_handleVotingDeadline] Processing expired deadlines', {
        count: documentsSnap.size,
      });

      const batch = db.batch();
      let operationCount = 0;

      for (const documentDoc of documentsSnap.docs) {
        const document = documentDoc.data() as Statement;
        const documentId = document.statementId;

        try {
          // Get all official paragraphs for this document
          const officialParagraphsSnap = await db
            .collection(Collections.statements)
            .where('parentId', '==', documentId)
            .where('doc.isOfficialParagraph', '==', true)
            .orderBy('doc.order', 'asc')
            .get();

          // Process each official paragraph
          for (const paragraphDoc of officialParagraphsSnap.docs) {
            const officialParagraph = paragraphDoc.data() as Statement;

            // Get winning suggestion
            const suggestionsSnap = await db
              .collection(Collections.statements)
              .where('parentId', '==', officialParagraph.statementId)
              .where('statementType', '==', officialParagraph.statementType)
              .orderBy('consensus', 'desc')
              .limit(1)
              .get();

            if (suggestionsSnap.empty) {
              continue;
            }

            const winningSuggestion = suggestionsSnap.docs[0]!.data() as Statement;

            // Only finalize if winning suggestion has higher consensus
            if (winningSuggestion.consensus <= officialParagraph.consensus) {
              continue;
            }

            // Create history entry (preserve old text)
            const historyEntry = {
              statementId: `history_${Date.now()}_${officialParagraph.statementId}`,
              statement: officialParagraph.statement,
              statementType: officialParagraph.statementType,
              parentId: officialParagraph.statementId,
              topParentId: documentId,
              creatorId: officialParagraph.creatorId,
              creator: officialParagraph.creator,
              createdAt: Date.now(),
              lastUpdate: Date.now(),
              consensus: officialParagraph.consensus,
              hide: true,
              replacedBy: winningSuggestion.statementId,
              replacedAt: Date.now(),
            };

            const historyRef = db.collection(Collections.statements).doc(historyEntry.statementId);
            batch.set(historyRef, historyEntry);

            // Update official paragraph
            const officialParagraphRef = db
              .collection(Collections.statements)
              .doc(officialParagraph.statementId);
            batch.update(officialParagraphRef, {
              statement: winningSuggestion.statement,
              lastUpdate: FieldValue.serverTimestamp(),
              appliedSuggestionId: winningSuggestion.statementId,
              appliedAt: FieldValue.serverTimestamp(),
              finalizedBy: 'system',
              finalizedAt: FieldValue.serverTimestamp(),
              finalizedReason: 'voting_deadline_expired',
            });

            // Mark suggestion as finalized
            const suggestionRef = db
              .collection(Collections.statements)
              .doc(winningSuggestion.statementId);
            batch.update(suggestionRef, {
              finalized: true,
              finalizedAt: FieldValue.serverTimestamp(),
              finalizedBy: 'system',
            });

            operationCount += 3;

            // Commit batch if approaching limit (500)
            if (operationCount >= 450) {
              await batch.commit();
              console.info('[fn_handleVotingDeadline] Committed batch', {
                operations: operationCount,
              });
              operationCount = 0;
            }
          }

          // Mark document deadline as finalized
          const documentRef = db.collection(Collections.statements).doc(documentId);
          batch.update(documentRef, {
            'doc.suggestionSettings.finalized': true,
            'doc.suggestionSettings.finalizedAt': FieldValue.serverTimestamp(),
          });

          operationCount++;
        } catch (error) {
          console.error('[fn_handleVotingDeadline] Error processing document', error, {
            documentId,
          });
          continue;
        }
      }

      // Commit final batch
      if (operationCount > 0) {
        await batch.commit();
        console.info('[fn_handleVotingDeadline] Committed final batch', {
          operations: operationCount,
        });
      }

      console.info('[fn_handleVotingDeadline] Completed', {
        documentsProcessed: documentsSnap.size,
        totalOperations: operationCount,
      });

      return null;
    } catch (error) {
      console.error('[fn_handleVotingDeadline] Error', error);
      return null;
    }
  });
