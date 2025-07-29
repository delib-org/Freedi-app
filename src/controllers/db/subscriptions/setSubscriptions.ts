import { doc, updateDoc, setDoc, Timestamp, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { FireStore } from '../config';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	Collections,
	Statement,
	StatementSchema,
	StatementSubscriptionSchema,
	User,
	Role,
	StatementSubscription,
	Creator
} from 'delib-npm';
import { parse } from 'valibot';

interface SetSubscriptionProps {
	statement: Statement,
	creator: Creator,
	role?: Role
	getInAppNotification?: boolean,
	getEmailNotification?: boolean,
	getPushNotification?: boolean
}

export async function setStatementSubscriptionToDB({
	statement,
	creator,
	role = Role.member,
	getInAppNotification = true,
	getEmailNotification = false,
	getPushNotification = false
}: SetSubscriptionProps): Promise<void> {
	try {
		const { statementId } = parse(StatementSchema, statement);

		const statementsSubscribeId = getStatementSubscriptionId(
			statementId,
			creator.uid
		);
		if (!statementsSubscribeId)
			throw new Error('Error in getting statementsSubscribeId');

		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementsSubscribeId
		);

		//check if user is already subscribed
		const statementSubscription = await getDoc(statementsSubscribeRef);
		if (statementSubscription.exists()) return;

		//if not subscribed, subscribe
		const subscriptionData: StatementSubscription = {
			user: creator,
			userId: creator.uid,
			statementsSubscribeId,
			statement,
			role,
			statementId,
			lastUpdate: Timestamp.now().toMillis(),
			createdAt: Timestamp.now().toMillis(),
			getInAppNotification,
			getEmailNotification,
			getPushNotification,
		};

		if (creator.uid === statement.creator.uid)
			subscriptionData.role = Role.admin;

		const parsedStatementSubscription = parse(
			StatementSubscriptionSchema,
			subscriptionData
		);

		await setDoc(statementsSubscribeRef, parsedStatementSubscription, {
			merge: true,
		});
	} catch (error) {
		console.error(error);
	}
}

export async function updateSubscriberForStatementSubStatements(
	statement: Statement,
	userId: string
) {
	try {
		const statementsSubscribeId = `${userId}--${statement.statementId}`;

		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementsSubscribeId
		);
		const newSubStatementsRead = {
			totalSubStatementsRead: statement.totalSubStatements || 0,
		};

		await updateDoc(statementsSubscribeRef, newSubStatementsRead);
	} catch (error) {
		console.error(error);
	}
}

export async function setRoleToDB(
	statement: Statement,
	role: Role,
	user: User
): Promise<void> {
	try {
		//getting current user role in statement
		const currentUserStatementSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			user.uid
		);
		if (!currentUserStatementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');
		const currentUserStatementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			currentUserStatementSubscriptionId
		);
		const currentUserStatementSubscription = await getDoc(
			currentUserStatementSubscriptionRef
		);
		const currentUserRole = currentUserStatementSubscription.data()?.role;
		if (!currentUserRole)
			throw new Error('Error in getting currentUserRole');
		if (
			currentUserRole !== Role.admin ||
			statement.creator.uid === user.uid
		)
			return;

		//setting user role in statement
		const statementSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			user.uid
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');
		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);

		return setDoc(statementSubscriptionRef, { role }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}

export async function updateMemberRole(
	statementId: string,
	userId: string,
	newRole: Role
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(
			statementId,
			userId
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);
		await updateDoc(statementSubscriptionRef, { role: newRole });
	} catch (error) {
		console.error('Error updating member role:', error);
	}
}

/**
 * Add a FCM token to a user's statement subscription
 */
export async function addTokenToSubscription(
	statementId: string,
	userId: string,
	token: string
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(
			statementId,
			userId
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);

		// Add token to the tokens array if it doesn't exist
		await updateDoc(statementSubscriptionRef, {
			tokens: arrayUnion(token),
			lastUpdate: Timestamp.now().toMillis()
		});
	} catch (error) {
		console.error('Error adding token to subscription:', error);
	}
}

/**
 * Remove a FCM token from a user's statement subscription
 */
export async function removeTokenFromSubscription(
	statementId: string,
	userId: string,
	token: string
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(
			statementId,
			userId
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);

		// Remove token from the tokens array
		await updateDoc(statementSubscriptionRef, {
			tokens: arrayRemove(token),
			lastUpdate: Timestamp.now().toMillis()
		});
	} catch (error) {
		console.error('Error removing token from subscription:', error);
	}
}

/**
 * Update notification preferences for a subscription
 */
export async function updateNotificationPreferences(
	statementId: string,
	userId: string,
	preferences: {
		getInAppNotification?: boolean;
		getEmailNotification?: boolean;
		getPushNotification?: boolean;
	}
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(
			statementId,
			userId
		);
		if (!statementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);

		await updateDoc(statementSubscriptionRef, {
			...preferences,
			lastUpdate: Timestamp.now().toMillis()
		});
	} catch (error) {
		console.error('Error updating notification preferences:', error);
	}
}
