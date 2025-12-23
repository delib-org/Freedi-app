import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { parse } from 'valibot';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementSchema,
	Role,
	StatementSubscription,
	StatementSubscriptionSchema,
	createSubscription,
	getStatementSubscriptionId,
	NotificationType,
	SimpleStatement,
	statementToSimpleStatement,
} from '@freedi/shared-types';
import { db } from './index';
import { getDefaultQuestionType } from './model/questionTypeDefaults';
import { embeddingService } from './services/embedding-service';
import { embeddingCache } from './services/embedding-cache-service';

/**
 * Consolidated function that handles all tasks when a new statement is created.
 * This replaces multiple separate functions to reduce the number of triggers.
 */
export async function onStatementCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>
): Promise<void> {
	if (!event.data) return;

	try {
		const statementData = event.data.data();

		// Ensure topParentId exists for legacy data that may not have it
		if (!statementData.topParentId) {
			statementData.topParentId = statementData.parentId || event.params.statementId;
		}

		const statement = parse(StatementSchema, statementData);

		// Run all creation tasks in parallel where possible
		const tasks: Promise<void>[] = [];

		// Task 1: Set up admins for the new statement
		tasks.push(setupAdminsForStatement(statement));

		// Task 2: Update chosen options (if applicable)
		if (statement.statementType === 'option') {
			tasks.push(updateChosenOptionsForNewStatement(statement));
		}

		// Task 3: Update parent statement (if not top-level)
		if (statement.parentId !== 'top') {
			tasks.push(updateParentForNewChild(statement));

			// Also update top-level parent subscriptions if different from direct parent
			if (statement.topParentId &&
				statement.topParentId !== statement.parentId &&
				statement.topParentId !== 'top') {
				tasks.push(updateTopParentSubscriptions(statement.topParentId));
			}
		}

		// Task 4: Add to mass consensus (if applicable)
		if (statement.statementType === 'option' && statement.consensus) {
			tasks.push(addStatementToMassConsensus(statement));
		}

		// Task 5: Create notifications (if not top-level)
		if (statement.parentId !== 'top') {
			tasks.push(createNotificationsForStatement(statement));
		}

		// Task 6: Generate embedding for option statements (async, non-blocking)
		if (statement.statementType === 'option') {
			tasks.push(generateEmbeddingForStatement(statement));
		}

		// Execute all tasks in parallel
		await Promise.all(tasks);

		logger.info(`Successfully processed creation of statement ${statement.statementId}`);
	} catch (error) {
		logger.error('Error in onStatementCreated:', error);
	}
}

/**
 * Sets up admin subscriptions for a new statement
 * (Replaces setAdminsToNewStatement)
 */
async function setupAdminsForStatement(statement: Statement): Promise<void> {
	try {
		const adminsToAdd = new Set<string>();

		// Always add the creator as admin
		adminsToAdd.add(statement.creator.uid);

		// Add top group admins (if applicable)
		const topParentId = statement.topParentId || statement.parentId;
		if (topParentId && topParentId !== 'top' && topParentId !== statement.statementId) {
			const topAdminsDB = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', topParentId)
				.where('role', '==', Role.admin)
				.get();

			topAdminsDB.docs.forEach(doc => {
				const adminSub = parse(StatementSubscriptionSchema, doc.data());
				adminsToAdd.add(adminSub.user.uid);
			});
		}

		// Add direct parent admins (if applicable)
		const { parentId } = statement;
		if (parentId && parentId !== 'top' && parentId !== topParentId) {
			const parentAdminsDB = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', parentId)
				.where('role', '==', Role.admin)
				.get();

			parentAdminsDB.docs.forEach(doc => {
				const adminSub = parse(StatementSubscriptionSchema, doc.data());
				adminsToAdd.add(adminSub.user.uid);
			});
		}

		// Batch create all admin subscriptions
		const batch = db.batch();
		const adminUserIds = Array.from(adminsToAdd);

		// Always add creator subscription first
		const creatorSubscription = createSubscription({
			statement,
			role: Role.admin,
			user: statement.creator,
			getEmailNotification: true,
			getInAppNotification: true,
			getPushNotification: true,
		});

		if (creatorSubscription?.statementsSubscribeId) {
			batch.set(
				db.collection(Collections.statementsSubscribe).doc(creatorSubscription.statementsSubscribeId),
				creatorSubscription
			);
		}

		// Add other admin subscriptions
		const otherAdminIds = adminUserIds.filter(uid => uid !== statement.creator.uid);
		if (otherAdminIds.length > 0) {
			// Get user data from existing subscriptions
			const existingSubscriptions = await db
				.collection(Collections.statementsSubscribe)
				.where('userId', 'in', otherAdminIds)
				.where('statementId', 'in', [topParentId, parentId].filter(Boolean))
				.get();

			const userMap = new Map();
			existingSubscriptions.docs.forEach(doc => {
				const sub = doc.data() as StatementSubscription;
				userMap.set(sub.user.uid, sub.user);
			});

			otherAdminIds.forEach(adminId => {
				const user = userMap.get(adminId);
				if (!user) return;

				const statementsSubscribeId = getStatementSubscriptionId(
					statement.statementId,
					user
				);

				if (!statementsSubscribeId) return;

				const newSubscription = createSubscription({
					statement,
					role: Role.admin,
					user: user,
					getEmailNotification: true,
					getInAppNotification: true,
					getPushNotification: true,
				});

				if (newSubscription) {
					batch.set(
						db.collection(Collections.statementsSubscribe).doc(statementsSubscribeId),
						newSubscription
					);
				}
			});
		}

		await batch.commit();
	} catch (error) {
		logger.error('Error in setupAdminsForStatement:', error);
		throw error;
	}
}

/**
 * Updates chosen options for a new statement
 * (Replaces updateChosenOptionsOnOptionCreate)
 */
async function updateChosenOptionsForNewStatement(statement: Statement): Promise<void> {
	try {
		// Implementation from updateChosenOptions function
		// This would contain the logic from fn_evaluation.ts
		// For now, just log that it would run
		logger.info(`Would update chosen options for statement ${statement.statementId}`);
	} catch (error) {
		logger.error('Error in updateChosenOptionsForNewStatement:', error);
		throw error;
	}
}

/**
 * Updates parent statement when a new child is created
 * (Replaces updateParentOnChildCreate)
 * This includes updating the parent's lastSubStatements and all subscriptions
 */
async function updateParentForNewChild(statement: Statement): Promise<void> {
	try {
		const parentId = statement.parentId;

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

		// Convert to SimpleStatement array
		const lastSubStatements: SimpleStatement[] = subStatementsQuery.docs.map(doc => {
			const stmt = doc.data() as Statement;
			
return statementToSimpleStatement(stmt);
		});

		const timestamp = Date.now();

		// Prepare update object
		const updateData: any = {
			subStatementsCount: FieldValue.increment(1),
			lastSubStatements: lastSubStatements,
			lastUpdate: timestamp,
			lastChildUpdate: timestamp,
		};

		// If the new statement is an option, also increment numberOfOptions
		if (statement.statementType === 'option') {
			updateData.numberOfOptions = FieldValue.increment(1);
		}

		// Update parent with new sub-statements, timestamp, and increment counts
		await parentRef.update(updateData);

		logger.info(`Updated parent ${parentId} with ${lastSubStatements.length} sub-statements`);

		// Update all subscriptions to the parent statement
		await updateParentSubscriptions(parentId, timestamp, lastSubStatements);

	} catch (error) {
		logger.error('Error in updateParentForNewChild:', error);
		throw error;
	}
}

/**
 * Updates the lastUpdate timestamp for all subscriptions to a specific statement
 * This ensures that parent subscriptions reflect changes in child statements
 */
async function updateParentSubscriptions(
	statementId: string,
	timestamp: number,
	lastSubStatements: SimpleStatement[]
): Promise<void> {
	try {
		const LIMIT = 500; // Safety limit to prevent runaway updates

		// Get all subscriptions for this specific statement
		const subscriptionsQuery = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.limit(LIMIT)
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
 * Adds statement to mass consensus
 * (Replaces addOptionToMassConsensus)
 */
async function addStatementToMassConsensus(statement: Statement): Promise<void> {
	try {
		const parentRef = db.collection(Collections.statements).doc(statement.parentId);

		await db.runTransaction(async (transaction) => {
			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				throw new Error('Parent statement does not exist');
			}

			const parentData = parentDoc.data();
			if (parentData && parentData.suggestions !== undefined) {
				transaction.update(parentRef, {
					suggestions: FieldValue.increment(1)
				});
			} else {
				transaction.update(parentRef, {
					suggestions: 1
				});
			}
		});

		logger.info(`Added statement ${statement.statementId} to mass consensus`);
	} catch (error) {
		logger.error('Error in addStatementToMassConsensus:', error);
		throw error;
	}
}

/**
 * Creates notifications for a new statement
 * (Replaces updateInAppNotifications)
 */
async function createNotificationsForStatement(statement: Statement): Promise<void> {
	try {
		// Get parent statement and subscribers
		const [parentStatementDB, subscribersDB] = await Promise.all([
			db.doc(`${Collections.statements}/${statement.parentId}`).get(),
			db.collection(Collections.statementsSubscribe)
				.where('statementId', '==', statement.parentId)
				.where('getInAppNotification', '==', true)
				.get()
		]);

		// Check if parent exists (for non-top statements)
		if (!parentStatementDB.exists) {
			logger.error(`Parent statement ${statement.parentId} not found`);

return;
		}

		const parentData = parentStatementDB.data();
		// Ensure topParentId exists for legacy data
		if (parentData && !parentData.topParentId) {
			parentData.topParentId = parentData.parentId || statement.parentId;
		}
		const parentStatement = parse(StatementSchema, parentData);
		const subscribers = subscribersDB.docs.map(
			doc => doc.data() as StatementSubscription
		);

		// Update last message in parent
		await db.doc(`${Collections.statements}/${statement.parentId}`).update({
			lastMessage: {
				message: statement.statement,
				creator: statement.creator.displayName || 'Anonymous',
				createdAt: statement.createdAt,
			},
		});

		// Create notifications for subscribers
		if (subscribers.length > 0) {
			const batch = db.batch();

			subscribers.forEach((subscriber: StatementSubscription) => {
				const notificationRef = db.collection(Collections.inAppNotifications).doc();
				const questionType = statement.questionSettings?.questionType ?? getDefaultQuestionType();

				const newNotification: NotificationType = {
					userId: subscriber.user.uid,
					parentId: statement.parentId,
					parentStatement: parentStatement.statement,
					statementType: statement.statementType,
					questionType: questionType,
					text: statement.statement,
					creatorId: statement.creator.uid,
					creatorName: statement.creator.displayName,
					creatorImage: statement.creator.photoURL,
					createdAt: statement.createdAt,
					read: false,
					notificationId: notificationRef.id,
					statementId: statement.statementId,
					viewedInList: false,
					viewedInContext: false,
				};

				batch.create(notificationRef, newNotification);
			});

			await batch.commit();
		}
	} catch (error) {
		logger.error('Error in createNotificationsForStatement:', error);
		throw error;
	}
}

/**
 * Updates only the subscriptions for a top-level parent without fetching sub-statements
 * This is used when a nested child changes to update the top-level group's lastUpdate
 */
async function updateTopParentSubscriptions(topParentId: string): Promise<void> {
	try {
		// Skip if topParentId is 'top' since it's not a real document
		if (topParentId === 'top') {
			logger.info('Skipping subscription update for "top" parent - not a real document');
			
return;
		}

		const LIMIT = 500; // Safety limit to prevent runaway updates
		const timestamp = Date.now();

		// First, update the top-level statement document itself
		const topParentRef = db.collection(Collections.statements).doc(topParentId);

		// Check if the statement exists and hasn't been updated recently (within 1 second)
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
			logger.warn(`Found more than ${LIMIT} subscriptions for top-level statement ${topParentId}, consider batching updates`);
		}

		logger.info(`Updating ${subscriptionsQuery.size} subscriptions for top-level statement ${topParentId}`);

		// Batch update for efficiency - only update lastUpdate timestamp
		const batch = db.batch();
		subscriptionsQuery.docs.forEach(doc => {
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
 * Generates an embedding for a new option statement
 * This enables fast vector-based similarity search
 */
async function generateEmbeddingForStatement(statement: Statement): Promise<void> {
	try {
		// Only generate embeddings for options with valid text
		if (!statement.statement || statement.statement.trim().length < 3) {
			logger.info(`Skipping embedding for statement ${statement.statementId} - text too short`);
			return;
		}

		// Get parent statement for context
		const parentId = statement.parentId;
		if (!parentId || parentId === 'top') {
			logger.info(`Skipping embedding for statement ${statement.statementId} - no parent context`);
			return;
		}

		const parentDoc = await db
			.collection(Collections.statements)
			.doc(parentId)
			.get();

		if (!parentDoc.exists) {
			logger.warn(`Parent statement ${parentId} not found for embedding context`);
			return;
		}

		const parentStatement = parentDoc.data() as Statement;
		const context = parentStatement.statement || '';

		// Generate context-aware embedding
		const startTime = Date.now();
		const result = await embeddingService.generateEmbeddingWithRetry(
			statement.statement,
			context
		);

		// Save embedding to the statement document
		await embeddingCache.saveEmbedding(
			statement.statementId,
			result.embedding,
			context
		);

		const duration = Date.now() - startTime;
		logger.info(`Generated embedding for statement ${statement.statementId}`, {
			durationMs: duration,
			dimensions: result.dimensions,
			hasContext: Boolean(context),
		});

	} catch (error) {
		// Log but don't fail the trigger - embedding generation is non-critical
		logger.error(`Failed to generate embedding for statement ${statement.statementId}:`, error);
	}
}