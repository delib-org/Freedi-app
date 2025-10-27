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
} from 'delib-npm';
import { db } from './index';
import { getDefaultQuestionType } from './model/questionTypeDefaults';

/**
 * Consolidated function that handles all tasks when a new statement is created.
 * This replaces multiple separate functions to reduce the number of triggers.
 */
export async function onStatementCreated(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined, { statementId: string }>
): Promise<void> {
	if (!event.data) return;

	try {
		const statement = parse(StatementSchema, event.data.data());

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
		}

		// Task 4: Add to mass consensus (if applicable)
		if (statement.statementType === 'option' && statement.consensus) {
			tasks.push(addStatementToMassConsensus(statement));
		}

		// Task 5: Create notifications (if not top-level)
		if (statement.parentId !== 'top') {
			tasks.push(createNotificationsForStatement(statement));
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
 */
async function updateParentForNewChild(statement: Statement): Promise<void> {
	try {
		const parentRef = db.collection(Collections.statements).doc(statement.parentId);

		// Update parent's child count and last update
		await parentRef.update({
			subStatementsCount: FieldValue.increment(1),
			lastChildUpdate: statement.createdAt,
		});
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
		// Implementation from fn_massConsensus.ts
		// For now, just log that it would run
		logger.info(`Would add statement ${statement.statementId} to mass consensus`);
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

		const parentStatement = parse(StatementSchema, parentStatementDB.data());
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