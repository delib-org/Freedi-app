import { store } from '@/redux/store';
import {
	collection,
	doc,
	onSnapshot,
	orderBy,
	query,
	limit,
	where,
	type Unsubscribe,
} from 'firebase/firestore';
import { DB } from '../config';
import { Collections } from '@freedi/shared-types';
import type { UserEngagement, CreditTransaction } from '@freedi/shared-types';
import {
	setUserEngagement,
	setRecentCredits,
	setEngagementLoading,
	clearEngagement,
} from '@/redux/engagement/engagementSlice';
import { logError } from '@/utils/errorHandling';

/**
 * Listen to the current user's engagement document.
 * Returns an unsubscribe function.
 */
export function listenToUserEngagement(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User not found');

		store.dispatch(setEngagementLoading(true));

		const engagementRef = doc(DB, Collections.userEngagement, user.uid);

		return onSnapshot(
			engagementRef,
			(snapshot) => {
				try {
					if (snapshot.exists()) {
						const data = snapshot.data();
						const engagement: UserEngagement = {
							...data,
							createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
							lastUpdate: data.lastUpdate?.toMillis ? data.lastUpdate.toMillis() : data.lastUpdate,
							trialModeExpiresAt: data.trialModeExpiresAt?.toMillis
								? data.trialModeExpiresAt.toMillis()
								: data.trialModeExpiresAt,
						} as UserEngagement;
						store.dispatch(setUserEngagement(engagement));
					} else {
						// No engagement doc yet - user is new
						store.dispatch(setUserEngagement(null));
					}
				} catch (error) {
					logError(error, {
						operation: 'engagement.db_engagement.listenToUserEngagement.snapshot',
					});
				}
			},
			(error: Error & { code?: string }) => {
				if (error.code === 'permission-denied') {
					store.dispatch(clearEngagement());

					return;
				}

				logError(error, {
					operation: 'engagement.db_engagement.listenToUserEngagement.error',
				});
			},
		);
	} catch (error) {
		logError(error, {
			operation: 'engagement.db_engagement.listenToUserEngagement',
		});

		return () => {
			return;
		};
	}
}

/**
 * Listen to the current user's recent credit transactions.
 * Returns an unsubscribe function.
 */
export function listenToRecentCredits(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User not found');

		const creditsRef = collection(DB, Collections.creditLedger);
		const q = query(
			creditsRef,
			where('userId', '==', user.uid),
			orderBy('createdAt', 'desc'),
			limit(20),
		);

		return onSnapshot(
			q,
			(snapshot) => {
				try {
					const credits: CreditTransaction[] = [];
					snapshot.forEach((docSnapshot) => {
						const data = docSnapshot.data();
						credits.push({
							...data,
							createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
						} as CreditTransaction);
					});
					store.dispatch(setRecentCredits(credits));
				} catch (error) {
					logError(error, {
						operation: 'engagement.db_engagement.listenToRecentCredits.snapshot',
					});
				}
			},
			(error: Error & { code?: string }) => {
				if (error.code === 'permission-denied') {
					return;
				}

				logError(error, {
					operation: 'engagement.db_engagement.listenToRecentCredits.error',
				});
			},
		);
	} catch (error) {
		logError(error, {
			operation: 'engagement.db_engagement.listenToRecentCredits',
		});

		return () => {
			return;
		};
	}
}
