import { updateDoc } from 'firebase/firestore';
import { Statement, StatementSubscription } from '@freedi/shared-types';
import { createSubscriptionRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { setBookmark } from '@/redux/statements/statementsSlice';
import { persistBookmarkToggle } from '@/controllers/db/bookmarks/bookmarksPersistence';

interface ToggleBookmarkProps {
	statementId: string;
	userId: string;
}

export async function toggleBookmark({ statementId, userId }: ToggleBookmarkProps): Promise<void> {
	try {
		if (!statementId) throw new Error('statementId is required');

		const currentValue = store.getState().statements.bookmarkedIds[statementId] === true;
		const newValue = !currentValue;

		// Immediate Redux update
		store.dispatch(setBookmark({ statementId, isBookmarked: newValue }));

		if (!userId) return;

		// Check if this is a room-level bookmark (direct subscription exists)
		const directSubscriptionId = `${userId}--${statementId}`;
		const directSub = store
			.getState()
			.statements.statementSubscription.find(
				(sub: StatementSubscription) => sub.statementsSubscribeId === directSubscriptionId,
			);

		if (directSub) {
			// Room-level bookmark: update the subscription's isBookmarked field
			const ref = createSubscriptionRef(directSubscriptionId);
			await updateDoc(ref, {
				isBookmarked: newValue,
				statementId,
				lastUpdate: getCurrentTimestamp(),
			});

			return;
		}

		// Child statement bookmark: persist to usersData collection
		const statement = store
			.getState()
			.statements.statements.find((s: Statement) => s.statementId === statementId);
		const topParentId = statement?.topParentId;
		if (!topParentId) return;

		persistBookmarkToggle(statementId, newValue, userId, topParentId).catch(() => {
			// Error already logged inside persistBookmarkToggle
		});
	} catch (error) {
		logError(error, {
			operation: 'bookmarks.toggleBookmark',
			userId,
			statementId,
		});
	}
}
