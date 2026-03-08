/**
 * Execute Paragraph Addition Controller
 * Handles admin undo of auto-added paragraphs
 */

import { Firestore } from 'firebase-admin/firestore';
import { Collections, DocumentActionHistory } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Parameters for undoing a paragraph addition
 */
export interface UndoAdditionParams {
	db: Firestore;
	actionId: string;
	userId: string;
}

/**
 * Result of undo operation
 */
export interface UndoAdditionResult {
	success: boolean;
	error?: string;
}

/**
 * Undo an auto-addition of a paragraph.
 * Hides the added paragraph, restores the consumed insertion point.
 *
 * @param params - Undo addition parameters
 * @returns Result with success status
 */
export async function undoParagraphAddition(
	params: UndoAdditionParams
): Promise<UndoAdditionResult> {
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

			if (action.actionType !== 'add') {
				throw new Error('Action is not an addition');
			}

			const now = Date.now();

			// Hide the added paragraph
			if (action.newParagraphId) {
				const paragraphRef = db.collection(Collections.statements).doc(action.newParagraphId);
				const paragraphSnap = await transaction.get(paragraphRef);

				if (paragraphSnap.exists) {
					transaction.update(paragraphRef, {
						hide: true,
						lastUpdate: now,
					});
				}
			}

			// Restore the consumed insertion point
			if (action.insertionPointId) {
				const insertionRef = db.collection(Collections.statements).doc(action.insertionPointId);
				const insertionSnap = await transaction.get(insertionRef);

				if (insertionSnap.exists) {
					transaction.update(insertionRef, {
						'doc.consumed': false,
						hide: false,
						lastUpdate: now,
					});
				}
			}

			// Mark action as undone
			transaction.update(actionRef, {
				undoneAt: now,
				undoneBy: userId,
			});

			return { success: true };
		});

		return result;
	} catch (error) {
		logError(error, {
			operation: 'executeParagraphAddition.undoParagraphAddition',
			userId,
			metadata: { actionId },
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
