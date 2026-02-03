/**
 * Create Version History Controller
 * Creates historical version entries for paragraphs
 */

import { Firestore, Transaction } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Parameters for creating version history
 */
export interface CreateVersionHistoryParams {
	db: Firestore;
	transaction?: Transaction;
	paragraphId: string;
	versionNumber: number;
	text: string;
	replacedBy: string;
	consensus: number;
	finalizedBy: string;
	adminEdited?: boolean;
	adminNotes?: string;
}

/**
 * Create a version history entry
 * Stores the previous version of a paragraph before replacement
 *
 * Version entries are stored as Statement objects with:
 * - statementId: history_{versionNumber}_{paragraphId}
 * - parentId: paragraphId
 * - hide: true (marks as history, not active content)
 * - versionControl.currentVersion: versionNumber
 *
 * @param params - Version history parameters
 */
export async function createVersionHistory(
	params: CreateVersionHistoryParams
): Promise<void> {
	const {
		db,
		transaction,
		paragraphId,
		versionNumber,
		text,
		replacedBy,
		consensus,
		finalizedBy,
		adminEdited,
		adminNotes,
	} = params;

	try {
		// Create version history statement ID
		const historyId = `history_${versionNumber}_${paragraphId}`;

		// Get the original paragraph to copy metadata
		const paragraphRef = db.collection(Collections.statements).doc(paragraphId);
		let paragraphSnap;

		if (transaction) {
			paragraphSnap = await transaction.get(paragraphRef);
		} else {
			paragraphSnap = await paragraphRef.get();
		}

		if (!paragraphSnap.exists) {
			throw new Error('Paragraph not found');
		}

		const paragraph = paragraphSnap.data() as Statement;

		// Create version history entry
		const historyEntry: Partial<Statement> = {
			statementId: historyId,
			parentId: paragraphId,
			topParentId: paragraph.topParentId,
			statement: text,
			creatorId: paragraph.creatorId,
			creator: paragraph.creator,
			statementType: paragraph.statementType,
			createdAt: paragraph.createdAt,
			lastUpdate: Date.now(),
			consensus,
			hide: true, // Mark as history

			// Version control metadata
			versionControl: {
				currentVersion: versionNumber,
				appliedSuggestionId: replacedBy,
				appliedAt: Date.now(),
				finalizedBy,
				finalizedAt: Date.now(),
				finalizedReason: 'manual_approval',
				...(adminEdited && { adminEditedContent: text }),
				...(adminNotes && { adminNotes }),
			},

			// Keep document metadata
			doc: paragraph.doc,
		};

		// Store version history
		const historyRef = db.collection(Collections.statements).doc(historyId);

		if (transaction) {
			transaction.set(historyRef, historyEntry);
		} else {
			await historyRef.set(historyEntry);
		}
	} catch (error) {
		logError(error, {
			operation: 'createVersionHistory',
			paragraphId,
			metadata: { versionNumber },
		});
		throw error; // Re-throw to fail the transaction
	}
}
