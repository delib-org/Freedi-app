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
	SimpleStatement,
	statementToSimpleStatement,
	functionConfig,
} from '@freedi/shared-types';
import { getParagraphsText } from './helpers';

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

			// Also update top-level parent if different from direct parent
			// AND if the current statement is not itself a top-level statement
			if (
				newStatement.topParentId &&
				newStatement.topParentId !== newStatement.parentId &&
				newStatement.parentId !== 'top'
			) {
				logger.info(`Also updating top-level parent ${newStatement.topParentId}`);
				await updateTopParentSubscriptions(newStatement.topParentId);
			}
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
			delete afterCopy.lastChildUpdate;
			delete afterCopy.lastUpdate;
			delete afterCopy.lastSubStatements;

			// If nothing else changed, this is likely our own update
			if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
				logger.info('Skipping update - appears to be triggered by parent update function');

				return;
			}

			// Check if this is a significant content change
			const hasContentChange =
				before.statement !== after.statement ||
				getParagraphsText(before.paragraphs) !== getParagraphsText(after.paragraphs) ||
				before.consensus !== after.consensus;

			if (!hasContentChange) {
				logger.info('No significant content changes, skipping parent update');

				return;
			}

			logger.info(`Child statement content changed, updating parent ${after.parentId}`);

			// Update parent statement with latest children
			await updateParentWithLatestChildren(after.parentId);

			// Also update top-level parent if different from direct parent
			// AND if the current statement is not itself a top-level statement
			if (after.topParentId && after.topParentId !== after.parentId && after.parentId !== 'top') {
				logger.info(`Also updating top-level parent ${after.topParentId}`);
				await updateTopParentSubscriptions(after.topParentId);
			}
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

		// Update parent with new sub-statements and timestamp
		await parentRef.update({
			lastSubStatements: lastSubStatements,
			lastUpdate: timestamp,
			lastChildUpdate: timestamp,
		});

		logger.info(`Updated parent ${parentId} with ${lastSubStatements.length} sub-statements`);

		// Update ONLY direct parent subscriptions (not cascading to all statements)
		await updateParentSubscriptions(parentId, timestamp, lastSubStatements);
	} catch (error) {
		logger.error(`Error updating parent ${parentId}:`, error);
	}
}

/**
 * Updates the lastUpdate timestamp for all subscriptions to a specific statement
 * This is limited to ONLY the direct parent statement to avoid cascading
 */
async function updateParentSubscriptions(
	statementId: string,
	timestamp: number,
	lastSubStatements: SimpleStatement[],
) {
	try {
		const LIMIT = 500; // Safety limit to prevent runaway updates

		// Get all subscriptions for this specific statement
		const subscriptionsQuery = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.limit(LIMIT) // Safety limit to prevent runaway updates
			.get();

		if (subscriptionsQuery.empty) {
			logger.info(`No subscriptions found for statement ${statementId}`);

			return;
		}

		if (subscriptionsQuery.size >= LIMIT) {
			logger.warn(
				`Found more than ${LIMIT} subscriptions for statement ${statementId}, consider batching updates`,
			);
		}

		logger.info(`Updating ${subscriptionsQuery.size} subscriptions for statement ${statementId}`);

		// Batch update for efficiency
		const batch = db.batch();
		subscriptionsQuery.docs.forEach((doc) => {
			batch.update(doc.ref, {
				lastUpdate: timestamp,
				lastSubStatements: lastSubStatements,
			});
		});

		await batch.commit();
		logger.info(`Successfully updated ${subscriptionsQuery.size} subscriptions`);
	} catch (error) {
		logger.error(`Error updating subscriptions for statement ${statementId}:`, error);
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

			// Also update top-level parent if different from direct parent
			// AND if the current statement is not itself a top-level statement
			if (
				deletedStatement.topParentId &&
				deletedStatement.topParentId !== deletedStatement.parentId &&
				deletedStatement.parentId !== 'top'
			) {
				logger.info(`Also updating top-level parent ${deletedStatement.topParentId}`);
				await updateTopParentSubscriptions(deletedStatement.topParentId);
			}
		} catch (error) {
			logger.error('Error in updateParentOnChildDelete:', error);
		}
	},
);

/**
 * Updates only the subscriptions for a top-level parent without fetching sub-statements
 * This is used when a nested child changes to update the top-level group's lastUpdate
 */
async function updateTopParentSubscriptions(topParentId: string) {
	try {
		// Skip if topParentId is 'top' since it's not a real document
		if (topParentId === 'top') {
			logger.info('Skipping subscription update for "top" parent - not a real document');

			return;
		}

		const LIMIT = 500; // Safety limit to prevent runaway updates
		const timestamp = Date.now();

		// First, update the top-level statement document itself
		// IMPORTANT: We only update lastUpdate field to avoid triggering content change detection
		const topParentRef = db.collection(Collections.statements).doc(topParentId);

		// Check if the statement exists and hasn't been updated recently (within 1 second)
		// This prevents rapid successive updates and potential loops
		const topParentDoc = await topParentRef.get();
		if (!topParentDoc.exists) {
			logger.warn(`Top-level statement ${topParentId} not found`);

			return;
		}

		const currentData = topParentDoc.data() as Statement;
		const lastUpdateTime = currentData.lastUpdate || 0;

		// Skip if this was updated within the last second (prevents rapid cascading)
		if (timestamp - lastUpdateTime < 1000) {
			logger.info(`Skipping update for ${topParentId} - was recently updated`);

			return;
		}

		// Update the statement's lastUpdate field
		// This will trigger updateParentOnChildUpdate, but it will be filtered out
		// because only lastUpdate changed (no content change)
		await topParentRef.update({
			lastUpdate: timestamp,
		});
		logger.info(`Updated top-level statement ${topParentId} with new timestamp`);

		// Get all subscriptions for this top-level statement
		const subscriptionsQuery = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', topParentId)
			.limit(LIMIT)
			.get();

		if (subscriptionsQuery.empty) {
			logger.info(`No subscriptions found for top-level statement ${topParentId}`);

			return;
		}

		if (subscriptionsQuery.size >= LIMIT) {
			logger.warn(
				`Found more than ${LIMIT} subscriptions for top-level statement ${topParentId}, consider batching updates`,
			);
		}

		logger.info(
			`Updating ${subscriptionsQuery.size} subscriptions for top-level statement ${topParentId}`,
		);

		// Batch update for efficiency - only update lastUpdate timestamp
		const batch = db.batch();
		subscriptionsQuery.docs.forEach((doc) => {
			batch.update(doc.ref, {
				lastUpdate: timestamp,
			});
		});

		await batch.commit();
		logger.info(`Successfully updated ${subscriptionsQuery.size} top-level subscriptions`);
	} catch (error) {
		logger.error(`Error updating top-level subscriptions for statement ${topParentId}:`, error);
	}
}

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
