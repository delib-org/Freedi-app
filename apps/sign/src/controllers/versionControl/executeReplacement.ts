/**
 * Execute Replacement Controller
 * Handles paragraph replacement with transaction safety
 */

import { Firestore } from 'firebase-admin/firestore';
import { Collections, Statement, PendingReplacement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { createVersionHistory } from './createVersionHistory';

/**
 * Parameters for executing a replacement
 */
export interface ExecuteReplacementParams {
	db: Firestore;
	queueItem: PendingReplacement;
	adminEditedText?: string;
	adminNotes?: string;
	userId: string;
}

/**
 * Result of replacement execution
 */
export interface ExecuteReplacementResult {
	success: boolean;
	newVersion?: number;
	error?: string;
}

/**
 * Execute a paragraph replacement
 * Uses Firestore transaction to ensure atomicity
 *
 * Steps:
 * 1. Create version history entry for current version
 * 2. Update paragraph with new text and increment version
 * 3. Mark suggestion as applied
 *
 * @param params - Replacement execution parameters
 * @returns Execution result with new version number
 */
export async function executeReplacement(
	params: ExecuteReplacementParams
): Promise<ExecuteReplacementResult> {
	const { db, queueItem, adminEditedText, adminNotes, userId } = params;

	try {
		// Use transaction to ensure atomicity
		const result = await db.runTransaction(async (transaction) => {
			// Get paragraph
			const paragraphRef = db.collection(Collections.statements).doc(queueItem.paragraphId);
			const paragraphSnap = await transaction.get(paragraphRef);

			if (!paragraphSnap.exists) {
				throw new Error('Paragraph not found');
			}

			const paragraph = paragraphSnap.data() as Statement;

			// Get suggestion
			const suggestionRef = db.collection(Collections.statements).doc(queueItem.suggestionId);
			const suggestionSnap = await transaction.get(suggestionRef);

			if (!suggestionSnap.exists) {
				throw new Error('Suggestion not found');
			}

			const suggestion = suggestionSnap.data() as Statement;

			// Determine final text (admin-edited or original suggestion)
			const finalText = adminEditedText || suggestion.statement;

			// Create version history entry for current version
			const currentVersion = paragraph.versionControl?.currentVersion || 1;
			await createVersionHistory({
				db,
				transaction,
				paragraphId: queueItem.paragraphId,
				versionNumber: currentVersion,
				text: paragraph.statement,
				replacedBy: queueItem.suggestionId,
				consensus: queueItem.consensus,
				finalizedBy: userId,
				adminEdited: !!adminEditedText,
				adminNotes,
			});

			// Calculate new version number
			const newVersion = currentVersion + 1;

			// Update paragraph
			transaction.update(paragraphRef, {
				statement: finalText,
				lastUpdate: Date.now(),
				'versionControl.currentVersion': newVersion,
				'versionControl.appliedSuggestionId': queueItem.suggestionId,
				'versionControl.appliedAt': Date.now(),
				'versionControl.finalizedBy': userId,
				'versionControl.finalizedAt': Date.now(),
				'versionControl.finalizedReason': 'manual_approval',
				...(adminEditedText && {
					'versionControl.adminEditedContent': adminEditedText,
					'versionControl.adminEditedAt': Date.now(),
				}),
				...(adminNotes && {
					'versionControl.adminNotes': adminNotes,
				}),
			});

			// Mark suggestion as applied (hide it from active suggestions)
			transaction.update(suggestionRef, {
				hide: true,
				lastUpdate: Date.now(),
			});

			return { success: true, newVersion };
		});

		return result;
	} catch (error) {
		logError(error, {
			operation: 'executeReplacement',
			paragraphId: queueItem.paragraphId,
			userId,
			metadata: { suggestionId: queueItem.suggestionId },
		});

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
