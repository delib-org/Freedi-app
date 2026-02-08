import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from './db';
import {
	Collections,
	Statement,
	PendingReplacement,
	ReplacementQueueStatus,
} from '@freedi/shared-types';

/**
 * Strip HTML tags from text (server-side version)
 */
function stripHtml(html: string): string {
	if (!html) return '';
	
return html
		.replace(/<[^>]*>/g, '') // Remove HTML tags
		.replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
		.replace(/&amp;/g, '&') // Replace &amp; with &
		.replace(/&lt;/g, '<') // Replace &lt; with <
		.replace(/&gt;/g, '>') // Replace &gt; with >
		.replace(/&quot;/g, '"') // Replace &quot; with "
		.replace(/&#39;/g, "'") // Replace &#39; with '
		.trim();
}

/**
 * Cloud Function: Create Replacement Queue Item
 *
 * Triggers when a suggestion's consensus crosses the review threshold.
 * Automatically creates a queue entry for admin review and supersedes older queue items.
 *
 * MVP Features:
 * - Auto-queue suggestions that reach reviewThreshold
 * - Supersede older queue items for the same paragraph
 * - Denormalize creator info for faster notifications
 * - Track consensus snapshot at creation for staleness detection
 */
export const fn_createReplacementQueueItem = onDocumentUpdated(
	`${Collections.statements}/{suggestionId}`,
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement;
			const after = event.data?.after.data() as Statement;

			if (!before || !after) {
				logger.warn('[fn_createReplacementQueueItem] Missing before/after data', {
					suggestionId: event.params.suggestionId,
				});
				
return null;
			}

			// Only process suggestions (not official paragraphs)
			if (after.doc?.isOfficialParagraph) {
				return null;
			}

			// Only process if suggestion has a parent (paragraph)
			if (!after.parentId || !after.topParentId) {
				return null;
			}

			// Get parent document to check version control settings
			const documentRef = db.collection(Collections.statements).doc(after.topParentId);
			const documentSnap = await documentRef.get();

			if (!documentSnap.exists) {
				logger.warn('[fn_createReplacementQueueItem] Document not found', {
					suggestionId: event.params.suggestionId,
					documentId: after.topParentId,
				});
				
return null;
			}

			const document = documentSnap.data() as Statement;

			// Check if version control enabled
			if (!document.doc?.versionControlSettings?.enabled) {
				return null;
			}

			const reviewThreshold = document.doc.versionControlSettings.reviewThreshold || 0.5;

			// Check if consensus crossed threshold (from below to above)
			if (before.consensus < reviewThreshold && after.consensus >= reviewThreshold) {
				logger.info('[fn_createReplacementQueueItem] Consensus crossed threshold', {
					suggestionId: event.params.suggestionId,
					beforeConsensus: before.consensus,
					afterConsensus: after.consensus,
					reviewThreshold,
				});

				// Get official paragraph
				const paragraphRef = db.collection(Collections.statements).doc(after.parentId);
				const paragraphSnap = await paragraphRef.get();

				if (!paragraphSnap.exists) {
					logger.warn('[fn_createReplacementQueueItem] Paragraph not found', {
						suggestionId: event.params.suggestionId,
						paragraphId: after.parentId,
					});
					
return null;
				}

				const paragraph = paragraphSnap.data() as Statement;

				// SUPERSEDE MECHANISM: Mark old queue items for same paragraph as superseded
				const existingQueueSnap = await db
					.collection(Collections.paragraphReplacementQueue)
					.where('paragraphId', '==', after.parentId)
					.where('status', '==', ReplacementQueueStatus.pending)
					.get();

				if (!existingQueueSnap.empty) {
					logger.info('[fn_createReplacementQueueItem] Superseding old queue items', {
						count: existingQueueSnap.size,
						paragraphId: after.parentId,
					});

					const batch = db.batch();
					existingQueueSnap.docs.forEach((doc) => {
						batch.update(doc.ref, {
							status: ReplacementQueueStatus.superseded,
							supersededBy: after.statementId,
							supersededAt: Date.now(),
						});
					});
					await batch.commit();
				}

				// Create queue entry
				const queueEntry: PendingReplacement = {
					queueId: `queue_${Date.now()}_${after.statementId}`,
					documentId: after.topParentId,
					paragraphId: after.parentId,
					suggestionId: after.statementId,
					currentText: stripHtml(paragraph.statement),
					proposedText: stripHtml(after.statement),
					consensus: after.consensus,
					consensusAtCreation: after.consensus, // Snapshot for staleness detection
					evaluationCount: after.totalEvaluators || 0,
					createdAt: Date.now(),
					status: ReplacementQueueStatus.pending,
					// Denormalized creator info for faster notifications
					creatorId: after.creatorId,
					creatorDisplayName: after.creator.displayName,
				};

				await db
					.collection(Collections.paragraphReplacementQueue)
					.doc(queueEntry.queueId)
					.set(queueEntry);

				logger.info('[fn_createReplacementQueueItem] Queue item created', {
					queueId: queueEntry.queueId,
					paragraphId: after.parentId,
					consensus: after.consensus,
				});
			}

			return null;
		} catch (error) {
			logger.error('[fn_createReplacementQueueItem] Error', {
				error: error instanceof Error ? error.message : String(error),
				suggestionId: event.params.suggestionId,
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Don't throw - this is a background trigger

			return null;
		}
	}
);
