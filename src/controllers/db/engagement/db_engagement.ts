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

interface SharedEngagementListener {
	unsubscribe: Unsubscribe;
	holders: number;
}

/** One Firestore listener per user, however many screens ask for it. */
const engagementListeners = new Map<string, SharedEngagementListener>();

function startEngagementListener(userId: string, onEnded: () => void): Unsubscribe {
	store.dispatch(setEngagementLoading(true));

	return onSnapshot(
		doc(DB, Collections.userEngagement, userId),
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
					userId,
				});
			}
		},
		(error: Error & { code?: string }) => {
			// Firestore ends a listener after an error, so nobody may join it now.
			onEnded();

			if (error.code === 'permission-denied') {
				store.dispatch(clearEngagement());

				return;
			}

			logError(error, {
				operation: 'engagement.db_engagement.listenToUserEngagement.error',
				userId,
			});
		},
	);
}

function forgetEngagementListener(userId: string, listener: SharedEngagementListener): void {
	if (engagementListeners.get(userId) === listener) {
		engagementListeners.delete(userId);
	}
}

function createSharedEngagementListener(userId: string): SharedEngagementListener {
	const listener: SharedEngagementListener = { unsubscribe: () => undefined, holders: 0 };
	engagementListeners.set(userId, listener);
	listener.unsubscribe = startEngagementListener(userId, () =>
		forgetEngagementListener(userId, listener),
	);

	return listener;
}

/**
 * Listen to the current user's engagement document. Joins the listener already
 * running for this user, if any. Returns a release function; the Firestore
 * listener stops when its last holder releases it.
 */
export function listenToUserEngagement(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User not found');

		const userId = user.uid;
		const listener =
			engagementListeners.get(userId) ?? createSharedEngagementListener(userId);
		listener.holders += 1;

		let isReleased = false;

		return () => {
			if (isReleased) return;
			isReleased = true;
			listener.holders -= 1;
			if (listener.holders > 0) return;
			forgetEngagementListener(userId, listener);
			listener.unsubscribe();
		};
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
