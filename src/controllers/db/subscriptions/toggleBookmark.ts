import { setDoc } from 'firebase/firestore';
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
		if (!statementId || !userId) throw new Error('statementId and userId are required');

		const currentValue = store.getState().statements.bookmarkedIds[statementId] === true;
		const newValue = !currentValue;

		// Optimistic Redux update
		store.dispatch(setBookmark({ statementId, isBookmarked: newValue }));

		// Persist to Firestore on the subscription doc
		const subscriptionId = `${userId}--${statementId}`;
		const ref = createSubscriptionRef(subscriptionId);
		await setDoc(
			ref,
			{
				isBookmarked: newValue,
				lastUpdate: getCurrentTimestamp(),
			},
			{ merge: true },
		);
	} catch (error) {
		// Revert optimistic update on error
		const currentValue = store.getState().statements.bookmarkedIds[statementId] === true;
		store.dispatch(setBookmark({ statementId, isBookmarked: !currentValue }));

		logError(error, {
			operation: 'subscriptions.toggleBookmark',
			userId,
			statementId,
		});
	}
}
