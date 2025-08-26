import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import {
	Collections,
	Role,
	Statement,
	StatementSchema,
	StatementSubscription,
	StatementSubscriptionSchema,
	createSubscription,
	getRandomUID,
	getStatementSubscriptionId,
	statementToSimpleStatement,
} from 'delib-npm';
import { parse } from 'valibot';
import { db } from '.';
import {
	DocumentSnapshot,
	QueryDocumentSnapshot,
} from 'firebase-functions/v1/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { Change } from 'firebase-functions/v1';

export async function onNewSubscription(
	event: FirestoreEvent<Change<DocumentSnapshot> | undefined>
) {
	try {
		logger.info('onNewSubscription triggered');
		
		if (!event.data) throw new Error('No event data found');
		
		// Handle both create and update scenarios
		const isCreate = !event.data.before.exists;
		const snapshot = event.data.after;
		
		logger.info(`Subscription event - isCreate: ${isCreate}`);
		
		if (!snapshot.exists)
			throw new Error('No snapshot found in onNewSubscription');

		const subscription = parse(
			StatementSubscriptionSchema,
			snapshot.data()
		) as StatementSubscription;

		// Check if this is a new subscription with waiting role, or an update to waiting role
		const role = subscription.role;
		const subscriptionId = subscription.statementsSubscribeId;
		if (!subscriptionId) throw new Error('No subscriptionId found');
		
		logger.info(`Subscription ${subscriptionId} has role: ${role}`);
		
		// For updates, check if role changed TO waiting
		let shouldCreateAwaitingEntry = false;
		if (isCreate && role === Role.waiting) {
			// New subscription with waiting role
			logger.info('New subscription with waiting role detected');
			shouldCreateAwaitingEntry = true;
		} else if (!isCreate && role === Role.waiting) {
			// Updated subscription - check if role changed to waiting
			const previousData = event.data.before.data();
			if (previousData) {
				const previousSubscription = parse(
					StatementSubscriptionSchema,
					previousData
				) as StatementSubscription;
				logger.info(`Previous role: ${previousSubscription.role}, Current role: ${role}`);
				if (previousSubscription.role !== Role.waiting) {
					// Role changed to waiting
					logger.info('Role changed to waiting - will create awaiting entries');
					shouldCreateAwaitingEntry = true;
				}
			}
		}
		
		if (shouldCreateAwaitingEntry) {
			logger.info('Creating awaiting entries...');
			
			//get all admins of the top parent statement
			const statement = subscription.statement;
			if (!statement) {
				logger.error('No statement found in subscription');
				return;
			}
			
			// Determine the top parent ID
			let topParentId: string;
			if (statement.parentId === 'top') {
				// This is a top-level statement
				topParentId = statement.statementId;
			} else if (statement.topParentId) {
				// This statement has a topParentId
				topParentId = statement.topParentId;
			} else {
				// Fallback: use the statement's own ID if no topParentId is set
				topParentId = statement.statementId;
				logger.warn(`Statement ${statement.statementId} has no topParentId, using its own ID`);
			}
			
			logger.info(`Looking for admins of statement: ${topParentId}`);

			const adminsDB = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', topParentId)
				.where('role', '==', Role.admin)
				.get();
			if (adminsDB.empty) {
				logger.error(`No admins found for statement ${topParentId}`);
				throw new Error('No admins found');
			}
			if (adminsDB.docs.length === 0) {
				logger.error(`No admin documents for statement ${topParentId}`);
				throw new Error('No admins found');
			}
			
			logger.info(`Found ${adminsDB.docs.length} admins`);

			const adminsSubscriptions = adminsDB.docs.map((doc) =>
				parse(StatementSubscriptionSchema, doc.data())
			) as StatementSubscription[];

			// First, check and remove any existing awaitingUsers entries for this subscription
			const existingAwaitingQuery = await db
				.collection(Collections.awaitingUsers)
				.where('statementsSubscribeId', '==', subscriptionId)
				.get();
			
			if (!existingAwaitingQuery.empty) {
				logger.info(`Removing ${existingAwaitingQuery.size} existing awaiting entries for ${subscriptionId}`);
				const deleteBatch = db.batch();
				existingAwaitingQuery.docs.forEach(doc => {
					deleteBatch.delete(doc.ref);
				});
				await deleteBatch.commit();
			}
			
			// Update the collection awaitingUsers for each admin
			const batch = db.batch();

			const collectionRef = db.collection(Collections.awaitingUsers);

			adminsSubscriptions.forEach((adminSub: StatementSubscription) => {
				const adminRef = collectionRef.doc(getRandomUID());
				const adminCall = {
					...subscription,
					adminId: adminSub.userId,
				};
				batch.set(adminRef, adminCall);
			});
			await batch.commit();
			logger.info(`Successfully created ${adminsSubscriptions.length} awaiting entries for subscription ${subscriptionId}`);
		} else {
			logger.info(`No awaiting entries needed for subscription ${subscriptionId} with role ${role}`);
		}
	} catch (error) {
		logger.error('Error onNewSubscription', error);

		return;
	}
}
export async function onStatementDeletionDeleteSubscriptions(
	event: FirestoreEvent<DocumentSnapshot | undefined, { statementId: string }>
) {
	try {
		const snapshot = event.data as DocumentSnapshot | undefined;
		if (!snapshot)
			throw new Error('No snapshot found in onNewSubscription');

		const deletedStatement = snapshot.data() as Statement | undefined;
		if (!deletedStatement) {
			throw new Error('No statement data found');
		}

		const statementId = event.params.statementId;
		logger.info(`Processing deletion of statement: ${statementId}`);

		// Proceed with the deletion process since the user is an admin
		// Query all subscriptions related to this statement
		const subscriptionsSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.get();

		if (subscriptionsSnapshot.empty) {
			logger.info(`No subscriptions found for statement ${statementId}`);

			return;
		}

		// Create a batch to delete all subscriptions
		const batch = db.batch();

		subscriptionsSnapshot.docs.forEach((doc) => {
			logger.info(`Adding subscription ${doc.id} to deletion batch`);
			batch.delete(doc.ref);
		});

		// Also delete any waiting approval entries
		const awaitingUsersSnapshot = await db
			.collection(Collections.awaitingUsers)
			.where('statementId', '==', statementId)
			.get();

		if (!awaitingUsersSnapshot.empty) {
			awaitingUsersSnapshot.docs.forEach((doc) => {
				logger.info(`Adding awaiting user ${doc.id} to deletion batch`);
				batch.delete(doc.ref);
			});
		}

		// Commit the batch deletion
		await batch.commit();
		logger.info(
			`Successfully deleted ${subscriptionsSnapshot.size} subscriptions for statement ${statementId}`
		);
	} catch (error) {
		logger.error('Error in onStatementDeletionDeleteSubscriptions:', error);
	}
}

export const updateSubscriptionsSimpleStatement = onDocumentUpdated({
	document: `${Collections.statements}/{statementId}`,
	region: 'europe-west1'
}, async (event) => {
	try {
		const _statementBefore = event.data?.before.data() as Statement | undefined;
		const _statementAfter = event.data?.after.data() as Statement | undefined;
		
		if (!_statementBefore || !_statementAfter) return;

		// Skip if this is an update caused by other functions (check for typical function-updated fields)
		if (_statementBefore.lastUpdate !== _statementAfter.lastUpdate && 
			_statementBefore.statement === _statementAfter.statement &&
			_statementBefore.description === _statementAfter.description) {
			logger.info('Skipping subscription update - only metadata changed');
			
return;
		}

		const simpleStatementBefore =
			statementToSimpleStatement(_statementBefore);
		const simpleStatementAfter =
			statementToSimpleStatement(_statementAfter);

		//check if statement or description changed
		if (
			simpleStatementBefore.statement === simpleStatementAfter.statement &&
			simpleStatementBefore.description === simpleStatementAfter.description
		) {
			logger.info('No content changes in statement, skipping subscription update');
			
return;
		}

		const statement = parse(StatementSchema, _statementAfter);

		const statementId: string = statement.statementId;

		//get all statement subscriptions
		const statementSubscriptions =
			await getStatementSubscriptions(statementId);

		//update all statement subscriptions
		if (statementSubscriptions.length === 0) {
			logger.info('No subscriptions found for statement ' + statementId);
			
return;
		}
		
		logger.info(`Updating ${statementSubscriptions.length} subscriptions for statement ${statementId}`);

		const batch = db.batch();
		const timestamp = Date.now();
		statementSubscriptions.forEach((subscription) => {
			const subscriptionRef = db
				.collection(Collections.statementsSubscribe)
				.doc(subscription.statementsSubscribeId);
			batch.update(subscriptionRef, { 
				statement: simpleStatementAfter,
				lastUpdate: timestamp 
			});
		});
		await batch.commit();
		
		logger.info(`Successfully updated ${statementSubscriptions.length} subscriptions`);
	} catch (error) {
		logger.error('Error updating updateMembersWithSimpleStatement', error);
	}
});

export async function getStatementSubscriptions(
	statementId: string
): Promise<StatementSubscription[]> {
	try {

		const statementSubscriptions = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', statementId)
			.get();

		if (statementSubscriptions.size > 100) throw new Error(`CIRCUIT BREAKER: Skipping update for ${statementSubscriptions.size} subscriptions`);

		return statementSubscriptions.docs.map(
			(doc) => doc.data() as StatementSubscription
		);

	} catch (error) {
		logger.error(
			`Error in getStatementSubscriptions for statementId ${statementId}:`,
			error
		);
		
return [];

	}
}

export async function setAdminsToNewStatement(
	ev: FirestoreEvent<
		QueryDocumentSnapshot | undefined,
		{
			statementId: string;
		}
	>
) {
	// This function implements a hybrid admin inheritance model:
	// 1. Creator becomes admin of their new statement
	// 2. Top group admins (root level) are admins of ALL sub-statements
	// 3. Direct parent admins are admins of immediate children only
	// This prevents exponential admin growth while maintaining hierarchy control

	if (!ev.data) return;

	try {
		const statement = parse(StatementSchema, ev.data.data());
		
		// List to track all admins to add (using Set to avoid duplicates)
		const adminsToAdd = new Set<string>();

		// 1. Always add the creator as admin
		adminsToAdd.add(statement.creator.uid);
		
		logger.info(`Setting up admins for new statement ${statement.statementId}`);

		// 2. Add top group admins (if this isn't already a top-level statement)
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
			
			logger.info(`Added ${topAdminsDB.size} top group admins from ${topParentId}`);
		}

		// 3. Add direct parent admins (if not same as top parent)
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
			
			logger.info(`Added ${parentAdminsDB.size} direct parent admins from ${parentId}`);
		}

		// Get user details for all admins
		const adminUserIds = Array.from(adminsToAdd);
		logger.info(`Total unique admins to add: ${adminUserIds.length}`);

		// Batch create all admin subscriptions
		const batch = db.batch();
		let addedCount = 0;

		// First, always add the creator's subscription
		const creatorSubscription = createSubscription({
			statement,
			role: Role.admin,
			user: statement.creator,
			getEmailNotification: true,
			getInAppNotification: true,
			getPushNotification: true,
		});

		if (!creatorSubscription || !creatorSubscription.statementsSubscribeId) {
			throw new Error('Failed to create creator subscription');
		}

		batch.set(
			db.collection(Collections.statementsSubscribe).doc(creatorSubscription.statementsSubscribeId),
			creatorSubscription
		);
		addedCount++;

		// Then add other admins (excluding creator to avoid duplicate)
		const otherAdminIds = adminUserIds.filter(uid => uid !== statement.creator.uid);
		
		// Fetch user data for other admins if needed
		if (otherAdminIds.length > 0) {
			// Note: You'll need to fetch user data for these admins
			// For now, we'll get them from existing subscriptions
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

			// Create subscriptions for other admins
			otherAdminIds.forEach(adminId => {
				const user = userMap.get(adminId);
				if (!user) {
					logger.warn(`Could not find user data for admin ${adminId}`);
					
return;
				}

				const statementsSubscribeId = getStatementSubscriptionId(
					statement.statementId,
					user
				);
				
				if (!statementsSubscribeId) {
					logger.warn(`Could not generate subscription ID for admin ${adminId}`);
					
return;
				}

				const newSubscription = createSubscription({
					statement,
					role: Role.admin,
					user: user,
					getEmailNotification: true,
					getInAppNotification: true,
					getPushNotification: true,
				});
				
				if (!newSubscription) {
					logger.warn(`Could not create subscription for admin ${adminId}`);
					
return;
				}

				batch.set(
					db.collection(Collections.statementsSubscribe).doc(statementsSubscribeId),
					newSubscription
				);
				addedCount++;
			});
		}

		// Commit all subscriptions in one batch
		await batch.commit();
		logger.info(`Successfully added ${addedCount} admin subscriptions for statement ${statement.statementId}`);

	} catch (error) {
		logger.error('Error in setAdminsToNewStatement:', error);
	}
}
