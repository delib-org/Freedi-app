import { updateDoc, deleteField } from 'firebase/firestore';
import { Statement, StatementSubscription } from '@freedi/shared-types';
import { createSubscriptionRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { setBookmark } from '@/redux/statements/statementsSlice';

interface ToggleBookmarkProps {
	statementId: string;
	userId: string;
}

/**
 * Find the room subscription for a given statement.
 * Looks up the statement's topParentId and finds the matching subscription.
 */
function findRoomSubscription(
	statementId: string,
	userId: string,
): { subscription: StatementSubscription; topParentId: string } | undefined {
	const state = store.getState().statements;

	// Find the statement to get its topParentId
	const statement = state.statements.find((s: Statement) => s.statementId === statementId);
	const topParentId = statement?.topParentId;
	if (!topParentId) return undefined;

	// Find the room subscription
	const roomSubscriptionId = `${userId}--${topParentId}`;
	const subscription = state.statementSubscription.find(
		(sub: StatementSubscription) => sub.statementsSubscribeId === roomSubscriptionId,
	);

	return subscription ? { subscription, topParentId } : undefined;
}

export async function toggleBookmark({ statementId, userId }: ToggleBookmarkProps): Promise<void> {
	try {
		if (!statementId) throw new Error('statementId is required');

		const currentValue = store.getState().statements.bookmarkedIds[statementId] === true;
		const newValue = !currentValue;

		// Always update Redux (works for all users including anonymous)
		store.dispatch(setBookmark({ statementId, isBookmarked: newValue }));

		// Persist to Firestore only for logged-in users
		if (!userId) {
			console.info('[toggleBookmark] No userId, skipping Firestore persist');

			return;
		}

		// Check if this is a room subscription (direct match)
		const directSubscriptionId = `${userId}--${statementId}`;
		const directSub = store
			.getState()
			.statements.statementSubscription.find(
				(sub: StatementSubscription) => sub.statementsSubscribeId === directSubscriptionId,
			);

		if (directSub) {
			// Bookmarking a room — use isBookmarked field directly
			console.info('[toggleBookmark] Direct room subscription found, updating isBookmarked');
			const ref = createSubscriptionRef(directSubscriptionId);
			await updateDoc(ref, {
				isBookmarked: newValue,
				statementId,
				lastUpdate: getCurrentTimestamp(),
			});

			return;
		}

		// Bookmarking a child statement — store on room subscription's bookmarkedChildren map
		const roomInfo = findRoomSubscription(statementId, userId);
		if (!roomInfo) {
			console.info('[toggleBookmark] No room subscription found for child statement', statementId);

			return;
		}

		console.info(
			'[toggleBookmark] Writing bookmarkedChildren on room subscription',
			roomInfo.subscription.statementsSubscribeId,
		);
		const roomRef = createSubscriptionRef(roomInfo.subscription.statementsSubscribeId);
		if (newValue) {
			await updateDoc(roomRef, {
				[`bookmarkedChildren.${statementId}`]: true,
				statementId: roomInfo.topParentId,
				lastUpdate: getCurrentTimestamp(),
			});
		} else {
			await updateDoc(roomRef, {
				[`bookmarkedChildren.${statementId}`]: deleteField(),
				statementId: roomInfo.topParentId,
				lastUpdate: getCurrentTimestamp(),
			});
		}
		console.info('[toggleBookmark] Firestore write succeeded');
	} catch (error) {
		console.info('[toggleBookmark] Error:', error);
		logError(error, {
			operation: 'subscriptions.toggleBookmark',
			userId,
			statementId,
		});
	}
}
