import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, Statement, PendingReplacement, ReplacementQueueStatus } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { verifyAdmin } from '@/lib/utils/versionControlHelpers';

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
 * POST /api/admin/version-control/[documentId]/sync
 * Scan existing suggestions and add qualifying ones to the review queue
 *
 * This is useful when version control is enabled on a document that already has
 * suggestions with high consensus that never crossed the threshold trigger.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
): Promise<NextResponse> {
	try {
		const { documentId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		// Verify admin access
		const db = getFirestoreAdmin();
		await verifyAdmin(db, documentId, userId);

		// Get document and version control settings
		const documentRef = db.collection(Collections.statements).doc(documentId);
		const documentSnap = await documentRef.get();

		if (!documentSnap.exists) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		const document = documentSnap.data() as Statement;

		// Check if version control is enabled
		if (!document.doc?.versionControlSettings?.enabled) {
			return NextResponse.json(
				{ error: 'Version control is not enabled for this document' },
				{ status: 400 }
			);
		}

		const reviewThreshold = document.doc.versionControlSettings.reviewThreshold || 0.5;

		logger.info('[Sync Queue] Starting sync', {
			documentId,
			reviewThreshold,
			userId,
		});

		// Get all official paragraphs (these are what suggestions propose to replace)
		// Note: Paragraphs have parentId === documentId
		const paragraphsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', documentId)
			.get();

		// Filter to only official paragraphs (not suggestions)
		const officialParagraphs = paragraphsSnap.docs
			.map(doc => doc.data() as Statement)
			.filter(stmt => stmt.doc?.isOfficialParagraph === true);

		logger.info('[Sync Queue] Found paragraphs', {
			totalStatementsWithParent: paragraphsSnap.size,
			officialParagraphsCount: officialParagraphs.length,
		});

		let addedCount = 0;
		let skippedCount = 0;
		const errors: string[] = [];

		// Process each paragraph
		for (const paragraph of officialParagraphs) {
			const paragraphId = paragraph.statementId;

			try {
				// Check if there's already a pending queue item for this paragraph
				const existingQueueSnap = await db
					.collection(Collections.paragraphReplacementQueue)
					.where('paragraphId', '==', paragraphId)
					.where('status', '==', ReplacementQueueStatus.pending)
					.limit(1)
					.get();

				if (!existingQueueSnap.empty) {
					logger.info('[Sync Queue] Paragraph already has pending queue item', {
						paragraphId,
					});
					skippedCount++;
					continue;
				}

				// Get all suggestions for this paragraph
				const suggestionsSnap = await db
					.collection(Collections.statements)
					.where('parentId', '==', paragraphId)
					.get();

				// Filter out official paragraphs and find suggestions that meet the threshold
				const allSuggestions = suggestionsSnap.docs.map((doc) => doc.data() as Statement);
				const suggestions = allSuggestions.filter((stmt) => !stmt.doc?.isOfficialParagraph);

				logger.info('[Sync Queue] Processing paragraph', {
					paragraphId,
					totalChildren: allSuggestions.length,
					suggestionsCount: suggestions.length,
					reviewThreshold,
				});

				const qualifyingSuggestions = suggestions
					.filter((suggestion) => {
						const meetsThreshold = (suggestion.consensus || 0) >= reviewThreshold;
						if (suggestions.length > 0 && suggestions.length <= 5) {
							logger.info('[Sync Queue] Suggestion details', {
								suggestionId: suggestion.statementId,
								consensus: suggestion.consensus,
								meetsThreshold,
								reviewThreshold,
							});
						}
						return meetsThreshold;
					})
					.sort((a, b) => (b.consensus || 0) - (a.consensus || 0)); // Highest consensus first

				if (qualifyingSuggestions.length === 0) {
					logger.info('[Sync Queue] No qualifying suggestions for paragraph', {
						paragraphId,
						suggestionsCount: suggestions.length,
					});
					continue;
				}

				// Add the highest consensus suggestion to the queue
				const topSuggestion = qualifyingSuggestions[0];

				const queueEntry: PendingReplacement = {
					queueId: `queue_${Date.now()}_${topSuggestion.statementId}`,
					documentId,
					paragraphId,
					suggestionId: topSuggestion.statementId,
					currentText: stripHtml(paragraph.statement),
					proposedText: stripHtml(topSuggestion.statement),
					consensus: topSuggestion.consensus,
					consensusAtCreation: topSuggestion.consensus,
					evaluationCount: topSuggestion.totalEvaluators || 0,
					createdAt: Date.now(),
					status: ReplacementQueueStatus.pending,
					creatorId: topSuggestion.creatorId,
					creatorDisplayName: topSuggestion.creator?.displayName || 'Anonymous',
				};

				await db
					.collection(Collections.paragraphReplacementQueue)
					.doc(queueEntry.queueId)
					.set(queueEntry);

				addedCount++;

				logger.info('[Sync Queue] Added suggestion to queue', {
					queueId: queueEntry.queueId,
					paragraphId,
					suggestionId: topSuggestion.statementId,
					consensus: topSuggestion.consensus,
				});
			} catch (error) {
				const errorMsg = `Failed to process paragraph ${paragraphId}: ${error instanceof Error ? error.message : String(error)}`;
				logger.error('[Sync Queue] Error processing paragraph', {
					paragraphId,
					error: errorMsg,
				});
				errors.push(errorMsg);
			}
		}

		logger.info('[Sync Queue] Sync completed', {
			documentId,
			addedCount,
			skippedCount,
			errorsCount: errors.length,
			officialParagraphsCount: officialParagraphs.length,
		});

		return NextResponse.json({
			success: true,
			addedCount,
			skippedCount,
			paragraphsScanned: officialParagraphs.length,
			errors: errors.length > 0 ? errors : undefined,
			message: `Sync completed: ${addedCount} suggestions added to queue, ${skippedCount} skipped (already in queue). Scanned ${officialParagraphs.length} paragraphs.`,
		});
	} catch (error) {
		logger.error('[Sync Queue] Error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('not an admin')) {
				return NextResponse.json(
					{ error: 'Forbidden - Admin access required' },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
