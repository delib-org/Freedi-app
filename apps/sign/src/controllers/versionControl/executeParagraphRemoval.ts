/**
 * Execute Paragraph Removal Controller
 * Handles admin undo of auto-removed paragraphs
 */

import { Firestore } from 'firebase-admin/firestore';
import { Collections, DocumentActionHistory } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Parameters for undoing a paragraph removal
 */
export interface UndoRemovalParams {
	db: Firestore;
	actionId: string;
	userId: string;
}

/**
 * Result of undo operation
 */
export interface UndoRemovalResult {
	success: boolean;
	error?: string;
}

/**
 * Undo an auto-removal of a paragraph.
 * Restores the paragraph (unhides it), sets a 24h cooldown, and records the undo.
 *
 * @param params - Undo removal parameters
 * @returns Result with success status
 */
export async function undoParagraphRemoval(
	params: UndoRemovalParams
): Promise<UndoRemovalResult> {
	const { db, actionId, userId } = params;

	try {
		const result = await db.runTransaction(async (transaction) => {
			// Get the action history entry
			const actionRef = db.collection(Collections.documentActionHistory).doc(actionId);
			const actionSnap = await transaction.get(actionRef);

			if (!actionSnap.exists) {
				throw new Error('Action not found');
			}

			const action = actionSnap.data() as DocumentActionHistory;

			if (action.undoneAt) {
				throw new Error('Action already undone');
			}

			if (action.actionType !== 'remove') {
				throw new Error('Action is not a removal');
			}

			// Restore the paragraph
			const paragraphRef = db.collection(Collections.statements).doc(action.paragraphId);
			const paragraphSnap = await transaction.get(paragraphRef);

			if (!paragraphSnap.exists) {
				throw new Error('Paragraph not found');
			}

			const now = Date.now();

			// Unhide and unmark as removed
			transaction.update(paragraphRef, {
				hide: false,
				'doc.removed': false,
				lastUpdate: now,
			});

			// Mark action as undone with cooldown
			transaction.update(actionRef, {
				undoneAt: now,
				undoneBy: userId,
				cooldownUntil: now + COOLDOWN_DURATION_MS,
			});

			return { success: true };
		});

		return result;
	} catch (error) {
		logError(error, {
			operation: 'executeParagraphRemoval.undoParagraphRemoval',
			userId,
			metadata: { actionId },
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
