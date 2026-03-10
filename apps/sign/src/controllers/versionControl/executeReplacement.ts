/**
 * Execute Replacement Controller
 * Handles paragraph replacement with transaction safety
 * Preserves winning suggestion and marks old suggestions with forVersion
 */

import { Firestore } from 'firebase-admin/firestore';
import { Collections, Statement, PendingReplacement, StatementType } from '@freedi/shared-types';
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
 * 1. Snapshot evaluation data from paragraph before overwriting
 * 2. Create version history entry with evaluation snapshot
 * 3. Update paragraph with new text, increment version, reset evaluations
 * 4. Mark winning suggestion as promoted (NOT hidden) — preserves its comments + evaluations
 * 5. After transaction: batch-mark remaining suggestions with forVersion
 *
 * @param params - Replacement execution parameters
 * @returns Execution result with new version number
 */
export async function executeReplacement(
	params: ExecuteReplacementParams
): Promise<ExecuteReplacementResult> {
	const { db, queueItem, adminEditedText, adminNotes, userId } = params;

	let currentVersion = 1;
	let newVersion = 2;

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

			// Step 1: Snapshot evaluation data before overwriting
			const evaluationSnapshot = {
				numberOfProEvaluators: paragraph.evaluation?.numberOfProEvaluators || 0,
				numberOfConEvaluators: paragraph.evaluation?.numberOfConEvaluators || 0,
				numberOfEvaluators: paragraph.evaluation?.numberOfEvaluators || 0,
				consensus: paragraph.consensus || 0,
			};

			// Step 2: Create version history entry with evaluation snapshot
			currentVersion = paragraph.versionControl?.currentVersion || 1;
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
				evaluationSnapshot,
			});

			// Calculate new version number
			newVersion = currentVersion + 1;

			// Step 3: Update paragraph — new text + reset evaluations for fresh start
			transaction.update(paragraphRef, {
				statement: finalText,
				lastUpdate: Date.now(),
				'versionControl.currentVersion': newVersion,
				'versionControl.appliedSuggestionId': queueItem.suggestionId,
				'versionControl.appliedAt': Date.now(),
				'versionControl.finalizedBy': userId,
				'versionControl.finalizedAt': Date.now(),
				'versionControl.finalizedReason': 'manual_approval',
				// Reset evaluations for fresh start on new text
				'evaluation.sumEvaluations': 0,
				'evaluation.numberOfEvaluators': 0,
				'evaluation.numberOfProEvaluators': 0,
				'evaluation.numberOfConEvaluators': 0,
				'evaluation.sumSquaredEvaluations': 0,
				'evaluation.averageEvaluation': 0,
				'evaluation.agreement': 0,
				'evaluation.sumPro': 0,
				'evaluation.sumCon': 0,
				consensus: 0,
				totalEvaluators: 0,
				...(adminEditedText && {
					'versionControl.adminEditedContent': adminEditedText,
					'versionControl.adminEditedAt': Date.now(),
				}),
				...(adminNotes && {
					'versionControl.adminNotes': adminNotes,
				}),
			});

			// Step 4: Mark winning suggestion as promoted (NOT hidden)
			// This preserves its comments and evaluations
			transaction.update(suggestionRef, {
				lastUpdate: Date.now(),
				'versionControl.promotedToVersion': newVersion,
				'versionControl.promotedAt': Date.now(),
			});

			return { success: true, newVersion };
		});

		// Step 5: After transaction — batch-mark remaining active suggestions with forVersion
		try {
			const activeSuggestions = await db.collection(Collections.statements)
				.where('parentId', '==', queueItem.paragraphId)
				.where('statementType', '==', StatementType.option)
				.where('hide', '==', false)
				.get();

			if (!activeSuggestions.empty) {
				const batch = db.batch();
				let batchCount = 0;

				for (const docSnap of activeSuggestions.docs) {
					const data = docSnap.data() as Statement;
					// Skip the promoted suggestion and already-versioned suggestions
					if (
						!data.versionControl?.promotedToVersion &&
						!data.versionControl?.forVersion
					) {
						batch.update(docSnap.ref, {
							'versionControl.forVersion': currentVersion,
						});
						batchCount++;
					}
				}

				if (batchCount > 0) {
					await batch.commit();
				}
			}
		} catch (batchError) {
			// Non-critical: log but don't fail the replacement
			logError(batchError, {
				operation: 'executeReplacement.markOldSuggestions',
				metadata: { paragraphId: queueItem.paragraphId, currentVersion },
			});
		}

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
