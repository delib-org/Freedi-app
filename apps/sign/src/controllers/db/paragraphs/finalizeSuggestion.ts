/**
 * Finalize Suggestion Controller
 *
 * Handles manual finalization of suggestions by admins.
 * Used in 'manual' and 'deadline' modes when admin accepts a suggestion.
 *
 * Flow:
 * 1. Get winning suggestion
 * 2. Create new suggestion from current official text (preserve history)
 * 3. Update official paragraph text to winning suggestion
 * 4. Mark as finalized with timestamp
 * 5. All clients receive update via Firestore listeners (real-time)
 */

import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement } from '@freedi/shared-types';
import { logError, DatabaseError, ValidationError } from '@/lib/utils/errorHandling';

/**
 * Finalize a suggestion for an official paragraph
 *
 * Direct Firestore transaction - no API route needed.
 * Admin calls this controller on "Accept Suggestion" button click.
 *
 * @param officialParagraphId - The official paragraph ID
 * @param suggestionId - The suggestion to finalize (optional - uses winning if not provided)
 * @param userId - The admin user ID
 * @returns Promise<void>
 *
 * @example
 * await finalizeSuggestion('para_123', 'suggestion_456', 'admin_user');
 */
export async function finalizeSuggestion(
  officialParagraphId: string,
  suggestionId: string | null,
  userId: string
): Promise<void> {
  const db = getFirestoreAdmin();

  try {
    await db.runTransaction(async (transaction) => {
      // 1. Get official paragraph
      const officialParagraphRef = db.collection(Collections.statements).doc(officialParagraphId);
      const officialParagraphSnap = await transaction.get(officialParagraphRef);

      if (!officialParagraphSnap.exists) {
        throw new ValidationError('Official paragraph not found', { officialParagraphId });
      }

      const officialParagraph = officialParagraphSnap.data() as Statement;

      if (!officialParagraph.doc?.isOfficialParagraph) {
        throw new ValidationError('Statement is not an official paragraph', {
          officialParagraphId,
        });
      }

      // 2. Get suggestion to finalize
      let suggestionToFinalize: Statement;

      if (suggestionId) {
        // Use specified suggestion
        const suggestionRef = db.collection(Collections.statements).doc(suggestionId);
        const suggestionSnap = await transaction.get(suggestionRef);

        if (!suggestionSnap.exists) {
          throw new ValidationError('Suggestion not found', { suggestionId });
        }

        suggestionToFinalize = suggestionSnap.data() as Statement;
      } else {
        // Get winning suggestion (highest consensus)
        const suggestionsSnap = await db
          .collection(Collections.statements)
          .where('parentId', '==', officialParagraphId)
          .where('statementType', '==', officialParagraph.statementType)
          .orderBy('consensus', 'desc')
          .limit(1)
          .get();

        if (suggestionsSnap.empty) {
          throw new ValidationError('No suggestions found for this paragraph', {
            officialParagraphId,
          });
        }

        suggestionToFinalize = suggestionsSnap.docs[0]!.data() as Statement;
      }

      // Validate suggestion is for this paragraph
      if (suggestionToFinalize.parentId !== officialParagraphId) {
        throw new ValidationError('Suggestion does not belong to this paragraph', {
          officialParagraphId,
          suggestionId: suggestionToFinalize.statementId,
          actualParentId: suggestionToFinalize.parentId,
        });
      }

      // 3. Preserve current official text as new suggestion (history)
      const historyEntry: Partial<Statement> = {
        statementId: `history_${Date.now()}`,
        statement: officialParagraph.statement,
        statementType: officialParagraph.statementType,
        parentId: officialParagraphId,
        topParentId: officialParagraph.topParentId,
        creatorId: officialParagraph.creatorId,
        creator: officialParagraph.creator,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: officialParagraph.consensus,
        hide: true, // Hidden history entry
        replacedBy: suggestionToFinalize.statementId,
        replacedAt: Date.now(),
      };

      const historyRef = db.collection(Collections.statements).doc(historyEntry.statementId!);
      transaction.set(historyRef, historyEntry);

      // 4. Update official paragraph with winning suggestion text
      transaction.update(officialParagraphRef, {
        statement: suggestionToFinalize.statement,
        lastUpdate: Date.now(),
        appliedSuggestionId: suggestionToFinalize.statementId,
        appliedAt: Date.now(),
        finalizedBy: userId,
        finalizedAt: Date.now(),
      });

      // 5. Mark suggestion as finalized
      const suggestionRef = db
        .collection(Collections.statements)
        .doc(suggestionToFinalize.statementId);
      transaction.update(suggestionRef, {
        finalized: true,
        finalizedAt: Date.now(),
        finalizedBy: userId,
      });
    });

    console.info('[Finalize Suggestion] Successfully finalized', {
      officialParagraphId,
      suggestionId: suggestionId || 'winning',
      userId,
    });
  } catch (error) {
    logError(error, {
      operation: 'paragraphs.finalizeSuggestion',
      userId,
      paragraphId: officialParagraphId,
      metadata: { suggestionId },
    });
    throw new DatabaseError('Failed to finalize suggestion', {
      officialParagraphId,
      suggestionId,
    });
  }
}

/**
 * Revert a finalized suggestion (restore previous text)
 *
 * @param officialParagraphId - The official paragraph ID
 * @param userId - The admin user ID
 * @returns Promise<void>
 */
export async function revertFinalization(
  officialParagraphId: string,
  userId: string
): Promise<void> {
  const db = getFirestoreAdmin();

  try {
    await db.runTransaction(async (transaction) => {
      // Get official paragraph
      const officialParagraphRef = db.collection(Collections.statements).doc(officialParagraphId);
      const officialParagraphSnap = await transaction.get(officialParagraphRef);

      if (!officialParagraphSnap.exists) {
        throw new ValidationError('Official paragraph not found', { officialParagraphId });
      }

      const officialParagraph = officialParagraphSnap.data() as Statement;

      // Find the most recent history entry
      const historySnap = await db
        .collection(Collections.statements)
        .where('parentId', '==', officialParagraphId)
        .where('hide', '==', true)
        .orderBy('replacedAt', 'desc')
        .limit(1)
        .get();

      if (historySnap.empty) {
        throw new ValidationError('No history found to revert to', { officialParagraphId });
      }

      const historyEntry = historySnap.docs[0]!.data() as Statement;

      // Restore old text
      transaction.update(officialParagraphRef, {
        statement: historyEntry.statement,
        lastUpdate: Date.now(),
        revertedFrom: officialParagraph.appliedSuggestionId,
        revertedAt: Date.now(),
        revertedBy: userId,
        appliedSuggestionId: null,
        finalizedBy: null,
        finalizedAt: null,
      });
    });

    console.info('[Finalize Suggestion] Successfully reverted', {
      officialParagraphId,
      userId,
    });
  } catch (error) {
    logError(error, {
      operation: 'paragraphs.revertFinalization',
      userId,
      paragraphId: officialParagraphId,
    });
    throw new DatabaseError('Failed to revert finalization', { officialParagraphId });
  }
}
