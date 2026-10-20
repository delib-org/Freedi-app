import {
	onDocumentWritten,
	onDocumentCreated,
	onDocumentUpdated,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import { db } from '.';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementType,
	SimpleStatement,
	statementToSimpleStatement,
	functionConfig,
} from '@freedi/shared-types';
import { generateDescriptionFromChildren } from './helpers';
import { classifyChildUpdate } from './userFeed/classifyChildUpdate';
import { recordDiscussionActivity } from './userFeed/recordDiscussionActivity';
import { writeHistoryEntry } from './statements/history/writeHistoryEntry';
import { isResearchEnabledForTopParent } from './statements/history/isResearchEnabled';
import {
	syncTopAnswersOnOptionDeleted,
	syncTopAnswersOnOptionUpdated,
} from './evaluation/topAnswerSync';

/**
 * Updates parent statement when a child statement is created
 */
export const updateParentOnChildCreate = onDocumentCreated(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const newStatement = event.data?.data() as Statement | undefined;

			// Skip if no parent or if parent is 'top' (special case for root-level statements)
			if (!newStatement || !newStatement.parentId || newStatement.parentId === 'top') return;

			logger.info(`New child statement created, updating parent ${newStatement.parentId}`);

			// Update parent statement with latest children
			await updateParentWithLatestChildren(newStatement.parentId);

			// New content is activity: raise the discussion on members' home pages.
			await recordDiscussionActivity(db, newStatement.topParentId);
		} catch (error) {
			logger.error('Error in updateParentOnChildCreate:', error);
		}
	},
);

/**
 * Updates parent statement when a child statement is modified (content changes only)
 */
export const updateParentOnChildUpdate = onDocumentUpdated(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const before = event.data?.before.data() as Statement | undefined;
			const after = event.data?.after.data() as Statement | undefined;

			// Skip if no data or no parent or if parent is 'top'
			if (!before || !after || !after.parentId || after.parentId === 'top') return;

			// Check if this update was triggered by our own function to prevent loops
			// Skip if only lastChildUpdate, lastUpdate, or lastSubStatements changed
			// Create shallow copies and cast to allow deletion of optional fields
			const beforeCopy = { ...before } as Partial<Statement>;
			const afterCopy = { ...after } as Partial<Statement>;

			// Remove fields that this function updates
			delete beforeCopy.lastChildUpdate;
			delete beforeCopy.lastUpdate;
			delete beforeCopy.lastSubStatements;
			delete beforeCopy.description;
			delete afterCopy.lastChildUpdate;
			delete afterCopy.lastUpdate;
			delete afterCopy.lastSubStatements;
			delete afterCopy.description;

			// If nothing else changed, this is likely our own update
			if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
				logger.info('Skipping update - appears to be triggered by parent update function');

				return;
			}

			// Keep the parent's cached top answers in step (hide / text edits).
			try {
				await syncTopAnswersOnOptionUpdated(before, after);
			} catch (syncError) {
				logger.error('updateParentOnChildUpdate: top-answer sync failed:', syncError);
			}

			// Only content edits continue. Consensus/evaluation/result changes stop
			// here: results reach clients live via the statement listeners, and they
			// must not re-order discussions or create unread activity.
			const {
				titleChanged,
				descriptionChanged,
				beforeParagraphs,
				afterParagraphs,
				isContentActivity,
			} = classifyChildUpdate(before, after);

			if (!isContentActivity) {
				logger.info('No content change (e.g. consensus only), skipping parent update');

				return;
			}

			// Write a text-change history entry when title or description actually differ.
			// Evaluation (consensus) deltas are tracked separately by the evaluation triggers.
			if (titleChanged || descriptionChanged) {
				try {
					const isResearch = await isResearchEnabledForTopParent(after.topParentId);
					await writeHistoryEntry({
						statement: after,
						source: 'text-change',
						isResearch,
						statementBefore: titleChanged ? before.statement : undefined,
						statementAfter: titleChanged ? after.statement : undefined,
						descriptionBefore: descriptionChanged ? beforeParagraphs : undefined,
						descriptionAfter: descriptionChanged ? afterParagraphs : undefined,
					});
				} catch (historyError) {
					logger.warn('[statementHistory] text-change write failed:', historyError);
				}
			}

			logger.info(`Child statement content changed, updating parent ${after.parentId}`);

			// Update parent statement with latest children
			await updateParentWithLatestChildren(after.parentId);

			// A text edit is activity: raise the discussion on members' home pages.
			await recordDiscussionActivity(db, after.topParentId);
		} catch (error) {
			logger.error('Error in updateParentOnChildUpdate:', error);
		}
	},
);

/**
 * DEPRECATED: Use updateParentOnChildCreate and updateParentOnChildUpdate instead
 * This function is disabled to prevent duplicate executions
 */
export const updateParentStatementOnChildChange = onDocumentWritten(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async () => {
		// DISABLED: This function is replaced by updateParentOnChildCreate and updateParentOnChildUpdate
		logger.info(
			'DEPRECATED: updateParentStatementOnChildChange called but disabled - using new split functions instead',
		);

		return;
	},
);

/**
 * Updates parent statement with the latest 3 sub-statements
 */
async function updateParentWithLatestChildren(parentId: string) {
	try {
		// Skip if parentId is 'top' since it's not a real document
		if (parentId === 'top') {
			logger.info('Skipping update for "top" parent - not a real document');

			return;
		}

		const parentRef = db.collection(Collections.statements).doc(parentId);

		// Get last 3 sub-statements ordered by creation date
		const subStatementsQuery = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.orderBy('createdAt', 'desc')
			.limit(3)
			.get();

		if (subStatementsQuery.empty) {
			logger.info(`No sub-statements found for parent ${parentId}`);

			return;
		}

		// Convert to SimpleStatement array
		const lastSubStatements: SimpleStatement[] = subStatementsQuery.docs.map((doc) => {
			const statement = doc.data() as Statement;

			return statementToSimpleStatement(statement);
		});

		const timestamp = Date.now();

		// Description must reflect the admin-authored body only. Build it
		// strictly from paragraph child statements — never from option,
		// question, or other child types, otherwise option text leaks into
		// the parent's description preview.
		const paragraphsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.paragraph)
			.orderBy('createdAt', 'desc')
			.limit(3)
			.get();

		const description = generateDescriptionFromChildren(
			paragraphsSnap.docs.map((doc) => {
				const stmt = doc.data() as Statement;

				return { statement: stmt.statement, createdAt: stmt.createdAt };
			}),
		);

		// Update parent with new sub-statements, timestamp, and description
		await parentRef.update({
			lastSubStatements: lastSubStatements,
			lastUpdate: timestamp,
			lastChildUpdate: timestamp,
			description: description || '',
		});

		logger.info(`Updated parent ${parentId} with ${lastSubStatements.length} sub-statements`);

		// REMOVED: updateParentSubscriptions fan-out
		// Previously wrote lastUpdate to ALL subscription docs for the parent statement (O(N) writes).
		// Now the parent Statement doc's lastChildUpdate field (set above) is the source of truth.
		// The client reads lastChildUpdate via Redux overlay and sorts using getLatestChildActivity().
	} catch (error) {
		logger.error(`Error updating parent ${parentId}:`, error);
	}
}

/**
 * Updates parent statement when a child statement is deleted
 */
export const updateParentOnChildDelete = onDocumentDeleted(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		try {
			const deletedStatement = event.data?.data() as Statement | undefined;

			// Skip if no parent or if parent is 'top'
			if (!deletedStatement || !deletedStatement.parentId || deletedStatement.parentId === 'top')
				return;

			logger.info(`Child statement deleted, updating parent ${deletedStatement.parentId}`);

			// A deleted top answer must leave the parent's cached results.
			try {
				await syncTopAnswersOnOptionDeleted(deletedStatement);
			} catch (syncError) {
				logger.error('updateParentOnChildDelete: top-answer sync failed:', syncError);
			}

			// If the deleted statement was an option, decrement the numberOfOptions count
			if (deletedStatement.statementType === 'option') {
				const parentRef = db.collection(Collections.statements).doc(deletedStatement.parentId);
				await parentRef.update({
					numberOfOptions: FieldValue.increment(-1),
					subStatementsCount: FieldValue.increment(-1),
				});
				logger.info(`Decremented numberOfOptions for parent ${deletedStatement.parentId}`);
			} else {
				// For non-option statements, just decrement subStatementsCount
				const parentRef = db.collection(Collections.statements).doc(deletedStatement.parentId);
				await parentRef.update({
					subStatementsCount: FieldValue.increment(-1),
				});
			}

			// Update parent statement with latest children
			await updateParentWithLatestChildren(deletedStatement.parentId);

			// A deletion is not activity: it no longer re-orders members' home
			// pages (it used to stamp up to 500 subscriptions, waking 3 membership
			// triggers per member). See docs/architecture/firebase-cost-2026-10/lane-a-feed.md.
		} catch (error) {
			logger.error('Error in updateParentOnChildDelete:', error);
		}
	},
);

/**
 * Optional: Function to backfill existing statements with lastSubStatements
 * This can be run once to migrate existing data
 */
export async function backfillLastSubStatements() {
	try {
		const statementsQuery = await db
			.collection(Collections.statements)
			.where('hasChildren', '==', true)
			.limit(500) // Process in batches
			.get();

		logger.info(`Found ${statementsQuery.size} statements to backfill`);

		for (const doc of statementsQuery.docs) {
			const statementId = doc.id;
			await updateParentWithLatestChildren(statementId);

			// Add delay to prevent overwhelming the system
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		logger.info('Backfill completed');
	} catch (error) {
		logger.error('Error in backfillLastSubStatements:', error);
	}
}
