import {
	updateDoc,
	setDoc,
	getDoc,
	arrayUnion,
	arrayRemove,
	runTransaction,
} from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
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
import { createSubscriptionRef, createTimestamps, updateTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

interface SetSubscriptionProps {
	statement: Statement;
	creator: Creator;
	role?: Role;
	getInAppNotification?: boolean;
	getEmailNotification?: boolean;
	getPushNotification?: boolean;
	/** FCM token already held by this device; stored so push works before any later token sync */
	pushToken?: string | null;
}

export async function setStatementSubscriptionToDB({
	statement,
	creator,
	role = Role.member,
	getInAppNotification = true,
	getEmailNotification = false,
	getPushNotification = false,
	pushToken = null,
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
			// Top-level query fields (promoted from embedded statement for efficient Firestore queries)
			parentId: statement.parentId,
			statementType: statement.statementType,
			topParentId: statement.topParentId || statement.parentId,
		};

		if (creator.uid && statement.creator?.uid && creator.uid === statement.creator.uid)
			subscriptionData.role = Role.admin;

		const parsedStatementSubscription = parse(StatementSubscriptionSchema, subscriptionData);

		// The backend reads subscription.tokens[] for push, so a push-enabled subscription
		// must carry this device's token from the start (no extra read: the doc is new here)
		const tokenFields = getPushNotification && pushToken ? { tokens: arrayUnion(pushToken) } : {};

		await setDoc(
			statementsSubscribeRef,
			{ ...parsedStatementSubscription, ...tokenFields },
			{
				merge: true,
			},
		);

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
				operation: 'subscriptions.setSubscriptions.setStatementSubscriptionToDB',
				metadata: { message: 'Error setting subscription:' },
			});
		}
	}
}

/**
 * Marks a discussion as read for a user. Runs in a transaction that only writes
 * when the new time is later than the stored one, so a stale tab or device can
 * never move lastReadTimestamp backwards. A missing subscription is left alone.
 */
export async function updateLastReadTimestamp(statementId: string, userId: string): Promise<void> {
	try {
		if (!statementId || !userId) throw new Error('statementId and userId are required');
		const statementsSubscribeRef = createSubscriptionRef(`${userId}--${statementId}`);

		await runTransaction(FireStore, async (transaction) => {
			const docSnap = await transaction.get(statementsSubscribeRef);
			// Don't create the doc - the user must be subscribed first
			if (!docSnap.exists()) return;

			const stored = Number(docSnap.data()?.lastReadTimestamp ?? 0);
			const now = Date.now();
			if (now <= stored) return;

			transaction.update(statementsSubscribeRef, {
				lastReadTimestamp: now,
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		});
	} catch (error) {
		// Only log non-permission errors
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'subscriptions.setSubscriptions.updateLastReadTimestamp',
				userId,
				statementId,
				metadata: { message: 'Error updating last read timestamp:' },
			});
		}
	}
}

export async function setRoleToDB(statement: Statement, role: Role, user: User): Promise<void> {
	try {
		//getting the acting (logged-in) user's role in the statement
		const actingUser = store.getState().creator.creator;
		if (!actingUser?.uid) throw new Error('Error in getting acting user');

		const actingUserSubscriptionId = getStatementSubscriptionId(
			statement.statementId,
			actingUser.uid,
		);
		if (!actingUserSubscriptionId) throw new Error('Error in getting statementSubscriptionId');
		const actingUserSubscription = await getDoc(createSubscriptionRef(actingUserSubscriptionId));
		const actingUserRole = actingUserSubscription.data()?.role;
		const actingUserIsAdmin =
			actingUserRole === Role.admin ||
			actingUserRole === Role.creator ||
			statement.creator?.uid === actingUser.uid;
		//only admins/creator may set roles, and the creator's own role must never be changed
		if (!actingUserIsAdmin || statement.creator?.uid === user.uid) return;

		//setting user role in statement
		const statementSubscriptionId = getStatementSubscriptionId(statement.statementId, user.uid);
		if (!statementSubscriptionId) throw new Error('Error in getting statementSubscriptionId');
		const statementSubscriptionRef = createSubscriptionRef(statementSubscriptionId);

		// Always include lastUpdate so the doc remains visible to the home
		// listeners' orderBy('lastUpdate') query (Firestore drops docs missing it).
		return setDoc(statementSubscriptionRef, { role, ...updateTimestamp() }, { merge: true });
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
			...updateTimestamp(),
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
				...updateTimestamp(),
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
