import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { db } from './db';
import {
	Collections,
	Statement,
	DocumentActionType,
	DocumentActionHistory,
	ReplacementQueueStatus,
	meetsRemovalThreshold,
	meetsAdditionThreshold,
	DEFAULT_REMOVAL_THRESHOLD,
	DEFAULT_ADDITION_THRESHOLD,
	DEFAULT_MIN_EVALUATORS,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';

/**
 * Strip HTML tags from text (server-side version)
 */
function stripHtml(html: string): string {
	if (!html) return '';

	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}

/**
 * Get consensus settings from document
 */
function getConsensusSettings(document: Statement) {
	const cs = document.doc?.versionControlSettings?.consensusSettings;

	return {
		removalThreshold: cs?.removalThreshold ?? DEFAULT_REMOVAL_THRESHOLD,
		additionThreshold: cs?.additionThreshold ?? DEFAULT_ADDITION_THRESHOLD,
		minEvaluators: cs?.minEvaluators ?? DEFAULT_MIN_EVALUATORS,
	};
}

/**
 * Cloud Function: Auto-Remove Paragraph
 *
 * Triggers when an official paragraph's consensus drops below the removal threshold.
 * Auto-executes removal: hides the paragraph, creates history entry, creates insertion point.
 *
 * Priority: If a suggestion meets replacement threshold, replacement wins over removal.
 */
export const fn_autoRemoveParagraph = onDocumentUpdated(
	{
		document: `${Collections.statements}/{paragraphId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement;
			const after = event.data?.after.data() as Statement;

			if (!before || !after) return null;

			// Only process official paragraphs
			if (!after.doc?.isOfficialParagraph) return null;

			// Skip already removed/hidden paragraphs
			if (after.doc?.removed || after.hide) return null;

			// Skip insertion points
			if (after.doc?.isInsertionPoint) return null;

			// Must have topParentId (document)
			if (!after.topParentId) return null;

			// Get document to check settings
			const documentRef = db.collection(Collections.statements).doc(after.topParentId);
			const documentSnap = await documentRef.get();

			if (!documentSnap.exists) return null;

			const document = documentSnap.data() as Statement;

			// Check if version control and consensus actions are enabled
			if (!document.doc?.versionControlSettings?.enabled) return null;
			if (!document.doc.versionControlSettings.consensusSettings) return null;

			const { removalThreshold, minEvaluators } = getConsensusSettings(document);
			const evaluatorCount = after.totalEvaluators || 0;

			// Check if consensus just crossed the removal threshold
			const wasAbove = !meetsRemovalThreshold(
				before.consensus,
				before.totalEvaluators || 0,
				removalThreshold,
				minEvaluators,
			);
			const isBelow = meetsRemovalThreshold(
				after.consensus,
				evaluatorCount,
				removalThreshold,
				minEvaluators,
			);

			if (!wasAbove || !isBelow) return null;

			logger.info('[fn_autoRemoveParagraph] Paragraph crossed removal threshold', {
				paragraphId: event.params.paragraphId,
				consensus: after.consensus,
				evaluatorCount,
				removalThreshold,
			});

			// Check cooldown: if this paragraph was recently undone, skip
			const recentActionSnap = await db
				.collection(Collections.documentActionHistory)
				.where('paragraphId', '==', after.statementId)
				.where('actionType', '==', DocumentActionType.remove)
				.where('undoneAt', '>', 0)
				.limit(1)
				.get();

			if (!recentActionSnap.empty) {
				const lastAction = recentActionSnap.docs[0].data() as DocumentActionHistory;
				if (lastAction.cooldownUntil && Date.now() < lastAction.cooldownUntil) {
					logger.info('[fn_autoRemoveParagraph] Skipping - cooldown active', {
						paragraphId: event.params.paragraphId,
						cooldownUntil: lastAction.cooldownUntil,
					});

					return null;
				}
			}

			// PRIORITY CHECK: If a suggestion meets replacement threshold, don't remove
			const reviewThreshold = document.doc.versionControlSettings.reviewThreshold || 0.5;
			const pendingReplacements = await db
				.collection(Collections.paragraphReplacementQueue)
				.where('paragraphId', '==', after.statementId)
				.where('status', '==', ReplacementQueueStatus.pending)
				.get();

			if (!pendingReplacements.empty) {
				// Check if any pending replacement has high enough consensus
				const hasStrongReplacement = pendingReplacements.docs.some((doc) => {
					const item = doc.data();

					return item.consensus >= reviewThreshold;
				});

				if (hasStrongReplacement) {
					logger.info('[fn_autoRemoveParagraph] Skipping - replacement has priority', {
						paragraphId: event.params.paragraphId,
					});

					return null;
				}
			}

			// Execute auto-removal
			const now = Date.now();
			const actionId = `action_remove_${now}_${after.statementId}`;
			const paragraphRef = db.collection(Collections.statements).doc(after.statementId);

			// Get adjacent paragraphs for insertion point placement
			const adjacentBefore = await db
				.collection(Collections.statements)
				.where('topParentId', '==', after.topParentId)
				.where('doc.isOfficialParagraph', '==', true)
				.where('doc.order', '<', after.doc.order)
				.orderBy('doc.order', 'desc')
				.limit(1)
				.get();

			const adjacentAfter = await db
				.collection(Collections.statements)
				.where('topParentId', '==', after.topParentId)
				.where('doc.isOfficialParagraph', '==', true)
				.where('doc.order', '>', after.doc.order)
				.orderBy('doc.order', 'asc')
				.limit(1)
				.get();

			const beforeParagraphId = adjacentBefore.empty ? undefined : adjacentBefore.docs[0].id;
			const afterParagraphId = adjacentAfter.empty ? undefined : adjacentAfter.docs[0].id;

			const batch = db.batch();

			// 1. Mark paragraph as removed (hide + doc.removed)
			batch.update(paragraphRef, {
				hide: true,
				'doc.removed': true,
				lastUpdate: now,
			});

			// 2. Create insertion point at the gap
			const insertionPointId = `insertion_${now}_${after.statementId}`;
			const insertionPointRef = db.collection(Collections.statements).doc(insertionPointId);
			const insertionPoint: Partial<Statement> = {
				statementId: insertionPointId,
				statement: '', // Empty - it's a virtual anchor
				creatorId: 'system',
				creator: {
					displayName: 'System',
					uid: 'system',
				},
				statementType: StatementType.option,
				parentId: after.topParentId,
				topParentId: after.topParentId,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				doc: {
					isDoc: true,
					order: after.doc.order, // Same order as removed paragraph
					isOfficialParagraph: true,
					isInsertionPoint: true,
					insertionBetween: {
						beforeParagraphId,
						afterParagraphId,
					},
				},
			};
			batch.set(insertionPointRef, insertionPoint);

			// 3. Create action history entry
			const actionHistoryRef = db.collection(Collections.documentActionHistory).doc(actionId);
			const actionHistory: DocumentActionHistory = {
				actionId,
				documentId: after.topParentId,
				paragraphId: after.statementId,
				actionType: DocumentActionType.remove,
				previousContent: stripHtml(after.statement),
				consensus: after.consensus,
				evaluatorCount,
				executedAt: now,
			};
			batch.set(actionHistoryRef, actionHistory);

			await batch.commit();

			logger.info('[fn_autoRemoveParagraph] Paragraph auto-removed', {
				paragraphId: after.statementId,
				actionId,
				insertionPointId,
				consensus: after.consensus,
			});

			return null;
		} catch (error) {
			logger.error('[fn_autoRemoveParagraph] Error', {
				error: error instanceof Error ? error.message : String(error),
				paragraphId: event.params.paragraphId,
				stack: error instanceof Error ? error.stack : undefined,
			});

			return null;
		}
	},
);

/**
 * Cloud Function: Auto-Add Paragraph from Insertion Point
 *
 * Triggers when a suggestion (child of an insertion point) crosses the addition threshold.
 * Auto-executes: creates new paragraph, consumes insertion point, creates new insertion points.
 */
export const fn_autoAddParagraph = onDocumentUpdated(
	{
		document: `${Collections.statements}/{suggestionId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement;
			const after = event.data?.after.data() as Statement;

			if (!before || !after) return null;

			// Skip official paragraphs
			if (after.doc?.isOfficialParagraph) return null;

			// Must have a parent (the insertion point)
			if (!after.parentId || !after.topParentId) return null;

			// Get parent statement to check if it's an insertion point
			const parentRef = db.collection(Collections.statements).doc(after.parentId);
			const parentSnap = await parentRef.get();

			if (!parentSnap.exists) return null;

			const parent = parentSnap.data() as Statement;

			// Only process if parent is an unconsumed insertion point
			if (!parent.doc?.isInsertionPoint || parent.doc?.consumed) return null;

			// Get document to check settings
			const documentRef = db.collection(Collections.statements).doc(after.topParentId);
			const documentSnap = await documentRef.get();

			if (!documentSnap.exists) return null;

			const document = documentSnap.data() as Statement;

			// Check if version control and consensus actions are enabled
			if (!document.doc?.versionControlSettings?.enabled) return null;
			if (!document.doc.versionControlSettings.consensusSettings) return null;

			const { additionThreshold, minEvaluators } = getConsensusSettings(document);
			const evaluatorCount = after.totalEvaluators || 0;

			// Check if consensus just crossed the addition threshold
			const wasBelowThreshold = !meetsAdditionThreshold(
				before.consensus,
				before.totalEvaluators || 0,
				additionThreshold,
				minEvaluators,
			);
			const isAboveThreshold = meetsAdditionThreshold(
				after.consensus,
				evaluatorCount,
				additionThreshold,
				minEvaluators,
			);

			if (!wasBelowThreshold || !isAboveThreshold) return null;

			logger.info('[fn_autoAddParagraph] Suggestion crossed addition threshold', {
				suggestionId: event.params.suggestionId,
				insertionPointId: after.parentId,
				consensus: after.consensus,
				evaluatorCount,
				additionThreshold,
			});

			// Check if there's a higher-consensus suggestion on this insertion point
			const siblingsSuggestions = await db
				.collection(Collections.statements)
				.where('parentId', '==', after.parentId)
				.where('hide', '!=', true)
				.get();

			const higherConsensusSibling = siblingsSuggestions.docs.find((doc) => {
				const sibling = doc.data() as Statement;

				return (
					sibling.statementId !== after.statementId &&
					sibling.consensus > after.consensus &&
					meetsAdditionThreshold(
						sibling.consensus,
						sibling.totalEvaluators || 0,
						additionThreshold,
						minEvaluators,
					)
				);
			});

			if (higherConsensusSibling) {
				logger.info('[fn_autoAddParagraph] Skipping - higher consensus suggestion exists', {
					suggestionId: event.params.suggestionId,
					higherSuggestionId: higherConsensusSibling.id,
				});

				return null;
			}

			// Execute auto-addition
			const now = Date.now();
			const insertionPointOrder = parent.doc.order ?? 0;
			const newParagraphId = `para_${now}_${after.statementId}`;
			const actionId = `action_add_${now}_${after.statementId}`;

			const batch = db.batch();

			// 1. Create new official paragraph from the suggestion
			const newParagraphRef = db.collection(Collections.statements).doc(newParagraphId);
			const newParagraph: Partial<Statement> = {
				statementId: newParagraphId,
				statement: after.statement,
				paragraphs: after.paragraphs,
				creatorId: after.creatorId,
				creator: after.creator,
				statementType: StatementType.option,
				parentId: after.topParentId,
				topParentId: after.topParentId,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				doc: {
					isDoc: true,
					order: insertionPointOrder, // Takes the insertion point's order
					isOfficialParagraph: true,
				},
			};
			batch.set(newParagraphRef, newParagraph);

			// 2. Mark insertion point as consumed
			batch.update(parentRef, {
				'doc.consumed': true,
				hide: true,
				lastUpdate: now,
			});

			// 3. Hide the suggestion
			const suggestionRef = db.collection(Collections.statements).doc(after.statementId);
			batch.update(suggestionRef, {
				hide: true,
				lastUpdate: now,
			});

			// 4. Create two new insertion points (before and after the new paragraph)
			const insertionBeforeId = `insertion_before_${now}_${newParagraphId}`;
			const insertionAfterIdStr = `insertion_after_${now}_${newParagraphId}`;

			const insertionBeforeRef = db.collection(Collections.statements).doc(insertionBeforeId);
			const insertionBeforePoint: Partial<Statement> = {
				statementId: insertionBeforeId,
				statement: '',
				creatorId: 'system',
				creator: { displayName: 'System', uid: 'system' },
				statementType: StatementType.option,
				parentId: after.topParentId,
				topParentId: after.topParentId,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				doc: {
					isDoc: true,
					order: insertionPointOrder - 0.001, // Slightly before
					isOfficialParagraph: true,
					isInsertionPoint: true,
					insertionBetween: {
						beforeParagraphId: parent.doc.insertionBetween?.beforeParagraphId,
						afterParagraphId: newParagraphId,
					},
				},
			};
			batch.set(insertionBeforeRef, insertionBeforePoint);

			const insertionAfterRef = db.collection(Collections.statements).doc(insertionAfterIdStr);
			const insertionAfterPoint: Partial<Statement> = {
				statementId: insertionAfterIdStr,
				statement: '',
				creatorId: 'system',
				creator: { displayName: 'System', uid: 'system' },
				statementType: StatementType.option,
				parentId: after.topParentId,
				topParentId: after.topParentId,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				doc: {
					isDoc: true,
					order: insertionPointOrder + 0.001, // Slightly after
					isOfficialParagraph: true,
					isInsertionPoint: true,
					insertionBetween: {
						beforeParagraphId: newParagraphId,
						afterParagraphId: parent.doc.insertionBetween?.afterParagraphId,
					},
				},
			};
			batch.set(insertionAfterRef, insertionAfterPoint);

			// 5. Create action history entry
			const actionHistoryRef = db.collection(Collections.documentActionHistory).doc(actionId);
			const actionHistory: DocumentActionHistory = {
				actionId,
				documentId: after.topParentId,
				paragraphId: newParagraphId,
				actionType: DocumentActionType.add,
				newContent: stripHtml(after.statement),
				consensus: after.consensus,
				evaluatorCount,
				executedAt: now,
				insertionPointId: after.parentId,
				insertAfterParagraphId: parent.doc.insertionBetween?.afterParagraphId,
				newParagraphId,
			};
			batch.set(actionHistoryRef, actionHistory);

			await batch.commit();

			logger.info('[fn_autoAddParagraph] Paragraph auto-added', {
				newParagraphId,
				actionId,
				insertionPointId: after.parentId,
				consensus: after.consensus,
			});

			return null;
		} catch (error) {
			logger.error('[fn_autoAddParagraph] Error', {
				error: error instanceof Error ? error.message : String(error),
				suggestionId: event.params.suggestionId,
				stack: error instanceof Error ? error.stack : undefined,
			});

			return null;
		}
	},
);
