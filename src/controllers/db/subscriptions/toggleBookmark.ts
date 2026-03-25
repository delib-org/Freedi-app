import { updateDoc } from 'firebase/firestore';
import { StatementSubscription } from '@freedi/shared-types';
import { createSubscriptionRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { setBookmark } from '@/redux/statements/statementsSlice';

interface ToggleBookmarkProps {
	statementId: string;
	userId: string;
}

export async function toggleBookmark({ statementId, userId }: ToggleBookmarkProps): Promise<void> {
	try {
		if (!statementId) throw new Error('statementId is required');

		const currentValue = store.getState().statements.bookmarkedIds[statementId] === true;
		const newValue = !currentValue;

		// Always update Redux (works for all users including anonymous)
		store.dispatch(setBookmark({ statementId, isBookmarked: newValue }));

		// Persist to Firestore only if the user has a subscription
		if (userId) {
			const subscriptionId = `${userId}--${statementId}`;
			const existingSub = store
				.getState()
				.statements.statementSubscription.find(
					(sub: StatementSubscription) =>
						sub.statementsSubscribeId === subscriptionId,
				);

			if (existingSub) {
				const ref = createSubscriptionRef(subscriptionId);
				await updateDoc(ref, {
					isBookmarked: newValue,
					lastUpdate: getCurrentTimestamp(),
				});
			}
		}
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.toggleBookmark',
			userId,
			statementId,
		});
	}
}
