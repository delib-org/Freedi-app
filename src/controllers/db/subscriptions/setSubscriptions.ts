import { updateDoc, setDoc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	Statement,
	StatementSchema,
	StatementSubscriptionSchema,
	User,
	Role,
	StatementSubscription,
	Creator,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { store } from '@/redux/store';
import { setShowGroupDemographicModal } from '@/redux/userDemographic/userDemographicSlice';
import {
	getGroupDemographicQuestions,
	getUserGroupAnswers,
} from '../userDemographic/getUserDemographic';
import { getStatementFromDB } from '../statements/getStatement';
import { createSubscriptionRef, createTimestamps } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SetSubscriptionProps {
	statement: Statement;
	creator: Creator;
	role?: Role;
	getInAppNotification?: boolean;
	getEmailNotification?: boolean;
	getPushNotification?: boolean;
}

export async function setStatementSubscriptionToDB({
	statement,
	creator,
	role = Role.member,
	getInAppNotification = true,
	getEmailNotification = false,
	getPushNotification = false,
}: SetSubscriptionProps): Promise<void> {
	try {
		// Validate inputs
		if (!statement || !creator || !creator.uid) {
			logError(new Error('Invalid inputs for setStatementSubscriptionToDB'), {
				operation: 'subscriptions.setSubscriptions.setStatementSubscriptionToDB',
				metadata: { detail: { statement, creator } },
			});

			return;
		}

		const { statementId } = parse(StatementSchema, statement);

		const statementsSubscribeId = getStatementSubscriptionId(statementId, creator.uid);
		if (!statementsSubscribeId) throw new Error('Error in getting statementsSubscribeId');

		const statementsSubscribeRef = createSubscriptionRef(statementsSubscribeId);

		//check if user is already subscribed
		const statementSubscription = await getDoc(statementsSubscribeRef);
		if (statementSubscription.exists()) return;

		//if not subscribed, subscribe
		const { createdAt, lastUpdate } = createTimestamps();
		const subscriptionData: StatementSubscription = {
			user: creator,
			userId: creator.uid,
			statementsSubscribeId,
			statement,
			role,
			statementId,
			lastUpdate,
			createdAt,
			getInAppNotification,
			getEmailNotification,
			getPushNotification,
		};

		if (creator.uid && statement.creator?.uid && creator.uid === statement.creator.uid)
			subscriptionData.role = Role.admin;

		const parsedStatementSubscription = parse(StatementSubscriptionSchema, subscriptionData);

		await setDoc(statementsSubscribeRef, parsedStatementSubscription, {
			merge: true,
		});

		// Token is stored centrally in pushNotifications collection
		// Backend should look it up there when sending notifications
		// No need to duplicate token in each subscription

		// Check for group-level demographic questions when subscribing to a top-level group
		const isTopParent = statement.parentId === 'top';
		if (isTopParent) {
			try {
				const groupQuestions = await getGroupDemographicQuestions(statement.statementId);

				if (groupQuestions.length > 0) {
					const userAnswers = await getUserGroupAnswers(statement.statementId, creator.uid);

					// Check for unanswered group questions
					const hasUnanswered = groupQuestions.some(
						(q) => !userAnswers.find((a) => a.userQuestionId === q.userQuestionId),
					);

					if (hasUnanswered) {
						// Dispatch action to show demographic modal
						store.dispatch(
							setShowGroupDemographicModal({
								show: true,
								topParentId: statement.statementId,
							}),
						);
					}
				}
			} catch (demographicError) {
				logError(demographicError, {
					operation: 'subscriptions.setSubscriptions.hasUnanswered',
					metadata: { message: 'Error checking group demographic questions:' },
				});
				// Don't fail the subscription if demographic check fails
			}
		}
	} catch (error) {
		// Only log non-permission errors
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'subscriptions.setSubscriptions.hasUnanswered',
				metadata: { message: 'Error setting subscription:' },
			});
		}
	}
}

export async function updateLastReadTimestamp(statementId: string, userId: string) {
	try {
		if (!statementId || !userId) throw new Error('statementId and userId are required');
		const statementsSubscribeId = `${userId}--${statementId}`;

		const statementsSubscribeRef = createSubscriptionRef(statementsSubscribeId);

		// Check if subscription exists first
		const docSnap = await getDoc(statementsSubscribeRef);

		if (docSnap.exists()) {
			// Document exists, update it
			await updateDoc(statementsSubscribeRef, {
				lastReadTimestamp: Date.now(),
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		}
		// If document doesn't exist, don't create it - user should be subscribed first
		// This prevents creating incomplete subscription objects
	} catch (error) {
		// Only log non-permission errors
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'subscriptions.setSubscriptions.updateLastReadTimestamp',
				metadata: { message: 'Error updating last read timestamp:' },
			});
		}
	}
}

export async function setRoleToDB(statement: Statement, role: Role, user: User): Promise<void> {
	try {
		//getting current user role in statement
		const currentUserStatementSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			user.uid,
		);
		if (!currentUserStatementSubscriptionId)
			throw new Error('Error in getting statementSubscriptionId');
		const currentUserStatementSubscriptionRef = createSubscriptionRef(
			currentUserStatementSubscriptionId,
		);
		const currentUserStatementSubscription = await getDoc(currentUserStatementSubscriptionRef);
		const currentUserRole = currentUserStatementSubscription.data()?.role;
		if (!currentUserRole) throw new Error('Error in getting currentUserRole');
		if (currentUserRole !== Role.admin || statement.creator.uid === user.uid) return;

		//setting user role in statement
		const statementSubscriptionId = getStatementSubscriptionId(statement.statementId, user.uid);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');
		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		return setDoc(statementSubscriptionRef, { role }, { merge: true });
	} catch (error) {
		logError(error, { operation: 'subscriptions.setSubscriptions.setRoleToDB' });
	}
}

export async function updateMemberRole(
	statementId: string,
	userId: string,
	newRole: Role,
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(statementId, userId);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		// If changing role to banned, validate that the user can be banned
		if (newRole === Role.banned) {
			const { canBanUser, getBanDisabledReason } = await import('@/helpers/roleHelpers');

			// Get current subscription data to check role
			const subscriptionDoc = await getDoc(statementSubscriptionRef);
			if (!subscriptionDoc.exists()) {
				throw new Error('User subscription not found');
			}

			const currentRole = subscriptionDoc.data()?.role as Role;
			const statement = await getStatementFromDB(statementId);

			if (!canBanUser(currentRole, userId, statement)) {
				const reason = getBanDisabledReason(currentRole, userId, statement);
				throw new Error(reason || 'This user cannot be banned');
			}
		}

		await updateDoc(statementSubscriptionRef, {
			role: newRole,
			statementId: statementId, // Include statementId to satisfy Firebase rules
		});
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.setSubscriptions.unknown',
			metadata: { message: 'Error updating member role:' },
		});
		throw error;
	}
}

/**
 * Add a FCM token to a user's statement subscription
 */
export async function addTokenToSubscription(
	statementId: string,
	userId: string,
	token: string,
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(statementId, userId);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		// Check if document exists
		const docSnap = await getDoc(statementSubscriptionRef);

		if (docSnap.exists()) {
			// Document exists, use updateDoc
			await updateDoc(statementSubscriptionRef, {
				tokens: arrayUnion(token),
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		}
		// If document doesn't exist, don't create it - user should be subscribed first
		// This prevents creating incomplete subscription objects
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.setSubscriptions.addTokenToSubscription',
			metadata: { message: 'Error adding token to subscription:' },
		});
	}
}

/**
 * Remove a FCM token from a user's statement subscription
 */
export async function removeTokenFromSubscription(
	statementId: string,
	userId: string,
	token: string,
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(statementId, userId);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		// Check if document exists before trying to update
		const docSnap = await getDoc(statementSubscriptionRef);

		if (docSnap.exists()) {
			// Remove token from the tokens array
			await updateDoc(statementSubscriptionRef, {
				tokens: arrayRemove(token),
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		}
		// If document doesn't exist, nothing to remove from
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.setSubscriptions.removeTokenFromSubscription',
			metadata: { message: 'Error removing token from subscription:' },
		});
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
	},
): Promise<void> {
	try {
		const statementSubscriptionId = getStatementSubscriptionId(statementId, userId);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');

		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		// Check if document exists
		const docSnap = await getDoc(statementSubscriptionRef);

		if (docSnap.exists()) {
			// Document exists, use updateDoc
			await updateDoc(statementSubscriptionRef, {
				...preferences,
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		}
		// If document doesn't exist, don't create it - user should be subscribed first
		// This prevents creating incomplete subscription objects
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.setSubscriptions.updateNotificationPreferences',
			metadata: { message: 'Error updating notification preferences:' },
		});
	}
}
