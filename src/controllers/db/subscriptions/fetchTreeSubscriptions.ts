import { getDocs, limit, query, where } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { setSeenMessageCounts } from '@/redux/statements/statementsSlice';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { UI } from '@/constants/common';

/** `${userId}--${topParentId}` already fetched this session. */
const fetchedTrees = new Set<string>();

/**
 * Brings what this person has seen in one discussion tree into Redux (a small
 * statementId -> seen count map, not the subscription docs, so Home's lists
 * are untouched), so the unread number can show on cards below the top level
 * (only top-level subscriptions are listened to). One query, equality
 * on userId + topParentId (served by the automatic single-field indexes), at
 * most UNREAD_TREE_SUBSCRIPTIONS_LIMIT docs, once per tree per session. Later
 * changes reach Redux through updateLastReadTimestamp.
 */
export async function fetchTreeSubscriptions(userId: string, topParentId: string): Promise<void> {
	const key = `${userId}--${topParentId}`;
	if (fetchedTrees.has(key)) return;
	fetchedTrees.add(key);

	try {
		const snapshot = await getDocs(
			query(
				createCollectionRef(Collections.statementsSubscribe),
				where('userId', '==', userId),
				where('topParentId', '==', topParentId),
				limit(UI.UNREAD_TREE_SUBSCRIPTIONS_LIMIT),
			),
		);

		const markers: Array<{ statementId: string; seenMessageCount: number }> = [];
		snapshot.forEach((docSnap) => {
			const { statementId, seenMessageCount } = docSnap.data() as {
				statementId?: unknown;
				seenMessageCount?: unknown;
			};
			if (typeof statementId === 'string') {
				markers.push({
					statementId,
					seenMessageCount: typeof seenMessageCount === 'number' ? seenMessageCount : 0,
				});
			}
		});
		if (markers.length > 0) store.dispatch(setSeenMessageCounts(markers));
	} catch (error) {
		fetchedTrees.delete(key);
		const err = error as { code?: string };
		if (err?.code !== 'permission-denied') {
			logError(error, {
				operation: 'subscriptions.fetchTreeSubscriptions',
				userId,
				metadata: { topParentId },
			});
		}
	}
}
