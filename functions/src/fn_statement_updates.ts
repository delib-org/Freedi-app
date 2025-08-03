import { onDocumentWritten, onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '.';
import { logger } from 'firebase-functions';
import {
    Collections,
    Statement,
    SimpleStatement,
    statementToSimpleStatement,
} from 'delib-npm';

/**
 * Updates parent statement when a child statement is created
 */
export const updateParentOnChildCreate = onDocumentCreated({
    document: `${Collections.statements}/{statementId}`,
    region: 'europe-west1'
}, async (event) => {
    try {
        const newStatement = event.data?.data() as Statement | undefined;
        
        // Skip if no parent
        if (!newStatement || !newStatement.parentId) return;
        
        logger.info(`New child statement created, updating parent ${newStatement.parentId}`);
        
        // Update parent statement with latest children
        await updateParentWithLatestChildren(newStatement.parentId);
        
    } catch (error) {
        logger.error('Error in updateParentOnChildCreate:', error);
    }
});

/**
 * Updates parent statement when a child statement is modified (content changes only)
 */
export const updateParentOnChildUpdate = onDocumentUpdated({
    document: `${Collections.statements}/{statementId}`,
    region: 'europe-west1'
}, async (event) => {
    try {
        const before = event.data?.before.data() as Statement | undefined;
        const after = event.data?.after.data() as Statement | undefined;
        
        // Skip if no data or no parent
        if (!before || !after || !after.parentId) return;
        
        // Check if this update was triggered by our own function to prevent loops
        // Skip if only lastChildUpdate, lastUpdate, or lastSubStatements changed
        const beforeCopy: any = { ...before };
        const afterCopy: any = { ...after };
        
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
        const hasContentChange = (
            before.statement !== after.statement ||
            before.description !== after.description ||
            before.consensus !== after.consensus
        );
        
        if (!hasContentChange) {
            logger.info('No significant content changes, skipping parent update');
            return;
        }
        
        logger.info(`Child statement content changed, updating parent ${after.parentId}`);
        
        // Update parent statement with latest children
        await updateParentWithLatestChildren(after.parentId);
        
    } catch (error) {
        logger.error('Error in updateParentOnChildUpdate:', error);
    }
});

/**
 * DEPRECATED: Use updateParentOnChildCreate and updateParentOnChildUpdate instead
 * This function is disabled to prevent duplicate executions
 */
export const updateParentStatementOnChildChange = onDocumentWritten({
    document: `${Collections.statements}/{statementId}`,
    region: 'europe-west1'
}, async () => {
    // DISABLED: This function is replaced by updateParentOnChildCreate and updateParentOnChildUpdate
    logger.info('DEPRECATED: updateParentStatementOnChildChange called but disabled - using new split functions instead');
    return;
});

/**
 * Updates parent statement with the latest 3 sub-statements
 */
async function updateParentWithLatestChildren(parentId: string) {
    try {
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
        const lastSubStatements: SimpleStatement[] = subStatementsQuery.docs.map(doc => {
            const statement = doc.data() as Statement;

            return statementToSimpleStatement(statement);
        });

        const timestamp = Date.now();

        // Update parent with new sub-statements and timestamp
        await parentRef.update({
            lastSubStatements: lastSubStatements,
            lastUpdate: timestamp,
            lastChildUpdate: timestamp
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
async function updateParentSubscriptions(statementId: string, timestamp: number,lastSubStatements: SimpleStatement[] ) {
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
            logger.warn(`Found more than ${LIMIT} subscriptions for statement ${statementId}, consider batching updates`);
        }

        logger.info(`Updating ${subscriptionsQuery.size} subscriptions for statement ${statementId}`);

        // Batch update for efficiency
        const batch = db.batch();
        subscriptionsQuery.docs.forEach(doc => {
            batch.update(doc.ref, {
                lastUpdate: timestamp,
                lastSubStatements: lastSubStatements
            });
        });

        await batch.commit();
        logger.info(`Successfully updated ${subscriptionsQuery.size} subscriptions`);

    } catch (error) {
        logger.error(`Error updating subscriptions for statement ${statementId}:`, error);
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
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        logger.info('Backfill completed');

    } catch (error) {
        logger.error('Error in backfillLastSubStatements:', error);
    }
}