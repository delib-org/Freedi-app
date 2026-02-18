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
    // Pre-fetch the winning suggestion ID outside the transaction if not provided.
    // This avoids running a non-transactional query inside the transaction.
    // The actual suggestion data is re-read atomically inside the transaction.
    let resolvedSuggestionId = suggestionId;

    if (!resolvedSuggestionId) {
      // We need the officialParagraph's statementType for the query,
      // so read it here as well (will be re-read inside the transaction)
      const officialParagraphSnap = await db
        .collection(Collections.statements)
        .doc(officialParagraphId)
        .get();

      if (!officialParagraphSnap.exists) {
        throw new ValidationError('Official paragraph not found', { officialParagraphId });
      }

      const officialParagraph = officialParagraphSnap.data() as Statement;

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

      resolvedSuggestionId = suggestionsSnap.docs[0]!.id;
    }

    await db.runTransaction(async (transaction) => {
      // 1. Get official paragraph (transactional read)
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

      // 2. Get suggestion to finalize (transactional read for atomicity)
      const suggestionRef = db.collection(Collections.statements).doc(resolvedSuggestionId!);
      const suggestionSnap = await transaction.get(suggestionRef);

      if (!suggestionSnap.exists) {
        throw new ValidationError('Suggestion not found', { suggestionId: resolvedSuggestionId });
      }

      const suggestionToFinalize = suggestionSnap.data() as Statement;

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
        versionControl: {
          currentVersion: officialParagraph.versionControl?.currentVersion || 1,
          replacedBy: suggestionToFinalize.statementId,
          replacedAt: Date.now(),
        },
      };

      const historyRef = db.collection(Collections.statements).doc(historyEntry.statementId!);
      transaction.set(historyRef, historyEntry);

      // 4. Update official paragraph with winning suggestion text
      transaction.update(officialParagraphRef, {
        statement: suggestionToFinalize.statement,
        lastUpdate: Date.now(),
        'versionControl.appliedSuggestionId': suggestionToFinalize.statementId,
        'versionControl.appliedAt': Date.now(),
        'versionControl.finalizedBy': userId,
        'versionControl.finalizedAt': Date.now(),
        'versionControl.currentVersion': (officialParagraph.versionControl?.currentVersion || 1) + 1,
      });

      // 5. Mark suggestion as finalized
      const finalizedSuggestionRef = db
        .collection(Collections.statements)
        .doc(suggestionToFinalize.statementId);
      transaction.update(finalizedSuggestionRef, {
        'versionControl.finalized': true,
        'versionControl.finalizedAt': Date.now(),
        'versionControl.finalizedBy': userId,
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
        'versionControl.appliedSuggestionId': null,
        'versionControl.finalizedBy': userId,
        'versionControl.finalizedAt': Date.now(),
        'versionControl.finalizedReason': 'rollback',
        'versionControl.currentVersion': (officialParagraph.versionControl?.currentVersion || 1) + 1,
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
