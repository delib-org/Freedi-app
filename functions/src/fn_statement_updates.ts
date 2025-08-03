import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '.';
import { logger } from 'firebase-functions';
import { 
    Collections, 
    Statement, 
    SimpleStatement, 
    statementToSimpleStatement
} from 'delib-npm';

/**
 * Updates parent statement when a child statement is created or modified
 * This replaces the need to update all subscription documents
 */
export const updateParentStatementOnChildChange = onDocumentWritten({
    document: `${Collections.statements}/{statementId}`,
    region: 'europe-west1'
}, async (event) => {
    try {
        const before = event.data?.before.data() as Statement | undefined;
        const after = event.data?.after.data() as Statement | undefined;
        
        // Skip if this is a deletion or no parent
        if (!after || !after.parentId) return;
        
        // Check if this is a significant change
        const isNewStatement = !before && after;
        const hasContentChange = before && after && (
            before.statement !== after.statement ||
            before.description !== after.description 
        );
        
        if (!isNewStatement && !hasContentChange) {
            logger.info('No significant changes, skipping parent update');
            
return;
        }
        
        // Update parent statement and propagate up the hierarchy
        await updateParentWithLatestChildren(after.parentId);
        
    } catch (error) {
        logger.error('Error in updateParentStatementOnChildChange:', error);
    }
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
        
        // Update parent with new sub-statements and timestamp
        await parentRef.update({
            lastSubStatements: lastSubStatements,
            lastUpdate: Date.now(),
            lastChildUpdate: Date.now()
        });
        
        logger.info(`Updated parent ${parentId} with ${lastSubStatements.length} sub-statements`);
        
        // Get parent data to check for grandparent
        const parentDoc = await parentRef.get();
        const parentData = parentDoc.data() as Statement;
        
        // Propagate timestamp update to grandparent if exists
        if (parentData.parentId && parentData.parentId !== 'top') {
            logger.info(`Propagating update to grandparent ${parentData.parentId}`);
            await updateGrandparentTimestamp(parentData.parentId);
        }
        
    } catch (error) {
        logger.error(`Error updating parent ${parentId}:`, error);
    }
}

// Removed updateParentLastChildUpdate - logic moved into updateParentWithLatestChildren

/**
 * Updates grandparent's lastChildUpdate timestamp
 * This ensures updates propagate up the entire hierarchy
 */
async function updateGrandparentTimestamp(grandparentId: string) {
    try {
        await db.collection(Collections.statements).doc(grandparentId).update({
            lastChildUpdate: Date.now()
        });
    } catch (error) {
        logger.error(`Error updating grandparent ${grandparentId}:`, error);
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