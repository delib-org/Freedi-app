import { updateDoc, setDoc, getDoc, arrayRemove, runTransaction } from 'firebase/firestore';
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
import { setSeenMessageCounts } from '@/redux/statements/statementsSlice';
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
		const statementNow = store
			.getState()
			.statements.statements.find((candidate) => candidate.statementId === statementId);

		//check if user is already subscribed
		const statementSubscription = await getDoc(statementsSubscribeRef);
		if (statementSubscription.exists()) {
			// A declined person (unsubscribed) coming back to a By-approval space
			// asks to join again: back to waiting, and the server's role → waiting
			// trigger re-creates their awaitingUsers entry for the hosts.
			if (role === Role.waiting && statementSubscription.data()?.role === Role.unsubscribed) {
				await updateDoc(statementsSubscribeRef, {
					role: Role.waiting,
					statementId,
					...updateTimestamp(),
				});
			}

			// Already there: make sure the card has a seen marker in Redux
			const existingSeen = statementSubscription.data()?.seenMessageCount;
			store.dispatch(
				setSeenMessageCounts([
					{ statementId, seenMessageCount: typeof existingSeen === 'number' ? existingSeen : 0 },
				]),
			);

			return;
		}

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
			// A new subscriber starts caught up: the history before they joined is not "unread"
			...(typeof statementNow?.descendantMessageCount === 'number'
				? { seenMessageCount: statementNow.descendantMessageCount }
				: {}),
		};

		if (creator.uid && statement.creator?.uid && creator.uid === statement.creator.uid)
			subscriptionData.role = Role.admin;

		const parsedStatementSubscription = parse(StatementSubscriptionSchema, subscriptionData);

		await setDoc(statementsSubscribeRef, parsedStatementSubscription, { merge: true });

		// The card gets its seen marker now, so numbers show without a reload
		store.dispatch(
			setSeenMessageCounts([
				{ statementId, seenMessageCount: subscriptionData.seenMessageCount ?? 0 },
			]),
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
 *
 * `descendantMessageCount` is the statement's counter as the person sees it
 * now. It becomes their `seenMessageCount` (never lower than what is stored),
 * which is what clears the unread number on the card.
 */
export async function updateLastReadTimestamp(
	statementId: string,
	userId: string,
	descendantMessageCount?: number,
): Promise<boolean> {
	try {
		if (!statementId || !userId) throw new Error('statementId and userId are required');
		const statementsSubscribeRef = createSubscriptionRef(`${userId}--${statementId}`);

		const seenAfter = await runTransaction(FireStore, async (transaction) => {
			const docSnap = await transaction.get(statementsSubscribeRef);
			// Don't create the doc - the user must be subscribed first
			if (!docSnap.exists()) return null;

			const stored = Number(docSnap.data()?.lastReadTimestamp ?? 0);
			const storedSeen = Number(docSnap.data()?.seenMessageCount ?? 0);
			const now = Date.now();
			const moveSeen =
				typeof descendantMessageCount === 'number' && descendantMessageCount > storedSeen;
			if (now > stored || moveSeen) {
				transaction.update(statementsSubscribeRef, {
					lastReadTimestamp: Math.max(now, stored),
					statementId: statementId, // Include statementId to satisfy Firebase rules
					...(moveSeen ? { seenMessageCount: descendantMessageCount } : {}),
				});
			}

			return moveSeen ? (descendantMessageCount as number) : storedSeen;
		});

		// null = no subscription doc yet: nothing recorded, the caller may retry
		if (seenAfter === null) return false;

		// Always give the card a seen marker (0 included), so later messages show a number
		store.dispatch(setSeenMessageCounts([{ statementId, seenMessageCount: seenAfter }]));

		return true;
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

		return true;
	}
}

/**
 * Clears a card's unread number when it opens without its own screen (the
 * answer chat sheet): marks it read with the counter the store holds now.
 */
export function markStatementSeen(statementId: string, userId: string | undefined): void {
	if (!userId) return;
	const count = store
		.getState()
		.statements.statements.find(
			(statement) => statement.statementId === statementId,
		)?.descendantMessageCount;
	void updateLastReadTimestamp(statementId, userId, count);
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
 * Removes an FCM token from the old `tokens[]` field of a user's subscription.
 * The field is read-only history now: it is never added to, and only a token
 * still listed there is removed, because `arrayRemove` on a missing field would
 * bring the field back as an empty list.
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

		const listedTokens: unknown = docSnap.exists() ? docSnap.data()?.tokens : undefined;
		if (Array.isArray(listedTokens) && listedTokens.includes(token)) {
			await updateDoc(statementSubscriptionRef, {
				tokens: arrayRemove(token),
				statementId: statementId, // Include statementId to satisfy Firebase rules
			});
		}
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
