import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { parse } from 'valibot';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementSchema,
	StatementType,
	Role,
	StatementSubscription,
	StatementSubscriptionSchema,
	createSubscription,
	getStatementSubscriptionId,
	NotificationType,
	SimpleStatement,
	statementToSimpleStatement,
	getRandomUID,
} from '@freedi/shared-types';
import { db } from './index';
import { getDefaultQuestionType } from './model/questionTypeDefaults';
import { embeddingService } from './services/embedding-service';
import { embeddingCache } from './services/embedding-cache-service';
import { FcmSubscriber, processFcmNotificationsImproved } from './fn_notifications';
import { trackStatementCreation } from './engagement/credits/trackEngagement';
import { onStatementCreatedStats } from './fn_adminStats';
import { generateDescriptionFromChildren } from './helpers';

/**
 * Consolidated function that handles all tasks when a new statement is created.
 * This replaces multiple separate functions to reduce the number of triggers.
 */
export async function onStatementCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>,
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

			// REMOVED: updateTopParentSubscriptions fan-out
			// The parent Statement doc's lastChildUpdate is the source of truth for activity.
			// The client reads it via Redux overlay and sorts using getLatestChildActivity().
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

		// Task 7: Track engagement (non-blocking)
		tasks.push(
			trackStatementCreation(statement).catch((err) =>
				logger.warn('Engagement tracking failed:', err),
			),
		);

		// Task 8: Track admin stats (non-blocking)
		tasks.push(
			onStatementCreatedStats(statement).catch((err) =>
				logger.warn('Admin stats tracking failed:', err),
			),
		);

		// Task 9: Split multi-line text into title + paragraph children (non-blocking)
		tasks.push(
			splitStatementIntoParagraphs(statement).catch((err) =>
				logger.warn('Paragraph splitting failed:', err),
			),
		);

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

			topAdminsDB.docs.forEach((doc) => {
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

			parentAdminsDB.docs.forEach((doc) => {
				const adminSub = parse(StatementSubscriptionSchema, doc.data());
				adminsToAdd.add(adminSub.user.uid);
			});
		}

		// Batch create all admin subscriptions
		const MAX_INHERITED_ADMINS = 20;
		const batch = db.batch();
		let adminUserIds = Array.from(adminsToAdd);

		// Cap inherited admins to prevent escalation in deep hierarchies
		const otherAdmins = adminUserIds.filter((uid) => uid !== statement.creator.uid);
		if (otherAdmins.length > MAX_INHERITED_ADMINS) {
			logger.warn(
				`Admin cap hit: ${otherAdmins.length} inherited admins for statement ${statement.statementId}, limiting to ${MAX_INHERITED_ADMINS}`,
			);
			adminUserIds = [statement.creator.uid, ...otherAdmins.slice(0, MAX_INHERITED_ADMINS)];
		}

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
				db
					.collection(Collections.statementsSubscribe)
					.doc(creatorSubscription.statementsSubscribeId),
				creatorSubscription,
			);
		}

		// Add other admin subscriptions
		const otherAdminIds = adminUserIds.filter((uid) => uid !== statement.creator.uid);
		if (otherAdminIds.length > 0) {
			// Get user data from existing subscriptions
			const existingSubscriptions = await db
				.collection(Collections.statementsSubscribe)
				.where('userId', 'in', otherAdminIds)
				.where('statementId', 'in', [topParentId, parentId].filter(Boolean))
				.get();

			const userMap = new Map();
			existingSubscriptions.docs.forEach((doc) => {
				const sub = doc.data() as StatementSubscription;
				userMap.set(sub.user.uid, sub.user);
			});

			otherAdminIds.forEach((adminId) => {
				const user = userMap.get(adminId);
				if (!user) return;

				const statementsSubscribeId = getStatementSubscriptionId(statement.statementId, user);

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
						newSubscription,
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
		const lastSubStatements: SimpleStatement[] = subStatementsQuery.docs.map((doc) => {
			const stmt = doc.data() as Statement;

			return statementToSimpleStatement(stmt);
		});

		const timestamp = Date.now();

		// Prepare update object - using Record type for Firestore compatibility
		const updateData: Record<string, FieldValue | SimpleStatement[] | number> = {
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

		// REMOVED: updateParentSubscriptions fan-out
		// The parent Statement doc's lastChildUpdate field (set above) is the source of truth.
		// The client reads it via Redux overlay and sorts using getLatestChildActivity().
	} catch (error) {
		logger.error('Error in updateParentForNewChild:', error);
		throw error;
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
					suggestions: FieldValue.increment(1),
				});
			} else {
				transaction.update(parentRef, {
					suggestions: 1,
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
		const [parentStatementDB, subscribersDB, pushSubscribersDB] = await Promise.all([
			db.doc(`${Collections.statements}/${statement.parentId}`).get(),
			db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', statement.parentId)
				.where('getInAppNotification', '==', true)
				.get(),
			db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', statement.parentId)
				.where('getPushNotification', '==', true)
				.get(),
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
		const subscribers = subscribersDB.docs.map((doc) => doc.data() as StatementSubscription);
		const pushSubscribers = pushSubscribersDB.docs.map(
			(doc) => doc.data() as StatementSubscription,
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
		// Use deterministic IDs to prevent duplicates if the function fires more than once
		// (Firebase Functions have at-least-once delivery guarantee)
		if (subscribers.length > 0) {
			const batch = db.batch();
			const seenUserIds = new Set<string>();

			subscribers.forEach((subscriber: StatementSubscription) => {
				// Skip duplicate subscribers (same user with multiple subscription docs)
				if (seenUserIds.has(subscriber.user.uid)) return;
				seenUserIds.add(subscriber.user.uid);

				// Deterministic ID: ensures idempotency if function retries
				const notificationId = `${subscriber.user.uid}_${statement.statementId}`;
				const notificationRef = db.collection(Collections.inAppNotifications).doc(notificationId);
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
					notificationId: notificationId,
					statementId: statement.statementId,
					viewedInList: false,
					viewedInContext: false,
				};

				batch.set(notificationRef, newNotification);
			});

			await batch.commit();
		}

		if (pushSubscribers.length > 0) {
			const fcmSubscribers: FcmSubscriber[] = [];

			pushSubscribers.forEach((subscriber) => {
				if (subscriber.tokens && subscriber.tokens.length > 0) {
					subscriber.tokens.forEach((token) => {
						fcmSubscribers.push({
							userId: subscriber.userId,
							token: token,
							documentId: `${subscriber.userId}_${statement.parentId}`,
						});
					});
				}
			});

			const sendResult = await processFcmNotificationsImproved(fcmSubscribers, statement);

			logger.info('Push notifications processed', {
				statementId: statement.statementId,
				parentId: statement.parentId,
				successful: sendResult.successful,
				failed: sendResult.failed,
				invalidTokens: sendResult.invalidTokens.length,
			});
		}
	} catch (error) {
		logger.error('Error in createNotificationsForStatement:', error);
		throw error;
	}
}

// REMOVED: updateTopParentSubscriptions
// Was doing O(N) writes to all subscriptions of the top-level parent.
// The parent Statement doc's lastChildUpdate is the source of truth now.

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

		const parentDoc = await db.collection(Collections.statements).doc(parentId).get();

		if (!parentDoc.exists) {
			logger.warn(`Parent statement ${parentId} not found for embedding context`);

			return;
		}

		const parentStatement = parentDoc.data() as Statement;
		const context = parentStatement.statement || '';

		// Generate context-aware embedding
		const startTime = Date.now();
		const result = await embeddingService.generateEmbeddingWithRetry(statement.statement, context);

		// Save embedding to the statement document
		await embeddingCache.saveEmbedding(statement.statementId, result.embedding, context);

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

/**
 * Splits a multi-line statement into title + paragraph children.
 * - First line becomes the parent's `statement` (title).
 * - Each remaining non-empty line becomes a child Statement with statementType 'paragraph'.
 * - A `description` (~200 chars) is auto-generated on the parent from the children.
 * - Skips if the statement text contains no newlines (single-line).
 */
async function splitStatementIntoParagraphs(statement: Statement): Promise<void> {
	try {
		const text = statement.statement;

		// Only split if there are newlines
		if (!text.includes('\n')) return;

		const lines = text.split('\n');
		const title = lines[0].trim();
		const bodyLines = lines.slice(1).filter((line) => line.trim());

		// Nothing to split if no body lines
		if (bodyLines.length === 0) return;

		if (!title) {
			logger.warn(`Statement ${statement.statementId} has no title after split, skipping`);

			return;
		}

		const now = Date.now();
		const batch = db.batch();

		// Create child paragraph statements
		const childrenData: { statement: string; createdAt: number }[] = [];

		for (let i = 0; i < bodyLines.length; i++) {
			const lineText = bodyLines[i].trim();
			if (!lineText) continue;

			const childId = getRandomUID();
			const childCreatedAt = now + i; // preserves order

			const childStatement: Record<string, unknown> = {
				statementId: childId,
				statement: lineText,
				statementType: StatementType.paragraph,
				parentId: statement.statementId,
				topParentId: statement.topParentId,
				parents: [...(statement.parents || []), statement.statementId],
				creatorId: statement.creatorId,
				creator: statement.creator,
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			};

			const childRef = db.collection(Collections.statements).doc(childId);
			batch.set(childRef, childStatement);

			childrenData.push({ statement: lineText, createdAt: childCreatedAt });
		}

		// Generate description from children
		const description = generateDescriptionFromChildren(childrenData);

		// Update parent: set title to first line, add description
		const parentRef = db.collection(Collections.statements).doc(statement.statementId);
		batch.update(parentRef, {
			statement: title,
			description,
		});

		await batch.commit();

		logger.info(
			`Split statement ${statement.statementId} into title + ${childrenData.length} paragraph children`,
		);
	} catch (error) {
		logger.error(`Error splitting statement ${statement.statementId} into paragraphs:`, error);
		throw error;
	}
}
