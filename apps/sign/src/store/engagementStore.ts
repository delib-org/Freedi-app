/**
 * Zustand engagement store for Sign app.
 * Wraps Firestore listener for the user's engagement data.
 */

import { create } from 'zustand';
import {
	doc,
	onSnapshot,
	collection,
	query,
	where,
	orderBy,
	limit,
	type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore, getFirebaseAuth } from '@/lib/firebase/client';
import { Collections } from '@freedi/shared-types';
import type { UserEngagement, CreditTransaction, Badge } from '@freedi/shared-types';
import { EngagementLevel } from '@freedi/shared-types';
import {
	calculateLevel,
	getLevelName,
	getLevelProgress,
	getNextLevelThreshold,
	canUserPerformAction,
	getLockedActionMessage,
	isAlmostUnlocked,
} from '@freedi/engagement-core';
import { logError } from '@/lib/utils/errorHandling';

interface EngagementState {
	engagement: UserEngagement | null;
	recentCredits: CreditTransaction[];
	loading: boolean;

	// Computed getters
	level: EngagementLevel;
	levelName: string;
	levelProgress: number;
	nextLevelThreshold: number;
	totalCredits: number;
	badges: Badge[];
	currentStreak: number;
	isTrialMode: boolean;

	// Actions
	startListening: (userId: string) => void;
	stopListening: () => void;
	canPerformAction: (action: string) => boolean;
	getLockedMessage: (action: string) => string;
	isAlmostUnlocked: (action: string) => boolean;
}

let engagementUnsub: Unsubscribe | null = null;
let creditsUnsub: Unsubscribe | null = null;

export const useEngagementStore = create<EngagementState>((set, get) => ({
	engagement: null,
	recentCredits: [],
	loading: true,

	// Computed - recalculated on read
	level: EngagementLevel.OBSERVER,
	levelName: 'Observer',
	levelProgress: 0,
	nextLevelThreshold: 50,
	totalCredits: 0,
	badges: [],
	currentStreak: 0,
	isTrialMode: false,

	startListening: (userId: string) => {
		// Clean up existing listeners
		get().stopListening();

		const db = getFirebaseFirestore();

		// Listen to user engagement doc
		const engagementRef = doc(db, Collections.userEngagement, userId);
		engagementUnsub = onSnapshot(
			engagementRef,
			(snapshot) => {
				try {
					if (snapshot.exists()) {
						const data = snapshot.data();
						const engagement: UserEngagement = {
							...data,
							createdAt: data.createdAt?.toMillis
								? data.createdAt.toMillis()
								: data.createdAt,
							lastUpdate: data.lastUpdate?.toMillis
								? data.lastUpdate.toMillis()
								: data.lastUpdate,
							trialModeExpiresAt: data.trialModeExpiresAt?.toMillis
								? data.trialModeExpiresAt.toMillis()
								: data.trialModeExpiresAt,
						} as UserEngagement;

						const level = engagement.level ?? calculateLevel(engagement.totalCredits);
						const isTrialMode =
							!!engagement.trialModeActive &&
							!!engagement.trialModeExpiresAt &&
							Date.now() < engagement.trialModeExpiresAt;

						set({
							engagement,
							loading: false,
							level,
							levelName: getLevelName(level),
							levelProgress: getLevelProgress(engagement.totalCredits, level),
							nextLevelThreshold: getNextLevelThreshold(level),
							totalCredits: engagement.totalCredits,
							badges: engagement.badges ?? [],
							currentStreak: engagement.streak?.currentStreak ?? 0,
							isTrialMode,
						});
					} else {
						set({ engagement: null, loading: false });
					}
				} catch (error) {
					logError(error, {
						operation: 'engagementStore.startListening.snapshot',
					});
				}
			},
			(error) => {
				logError(error, {
					operation: 'engagementStore.startListening.error',
				});
				set({ loading: false });
			},
		);

		// Listen to recent credits
		const creditsRef = collection(db, Collections.creditLedger);
		const creditsQuery = query(
			creditsRef,
			where('userId', '==', userId),
			orderBy('createdAt', 'desc'),
			limit(20),
		);

		creditsUnsub = onSnapshot(
			creditsQuery,
			(snapshot) => {
				try {
					const credits: CreditTransaction[] = [];
					snapshot.forEach((docSnapshot) => {
						const data = docSnapshot.data();
						credits.push({
							...data,
							createdAt: data.createdAt?.toMillis
								? data.createdAt.toMillis()
								: data.createdAt,
						} as CreditTransaction);
					});
					set({ recentCredits: credits });
				} catch (error) {
					logError(error, {
						operation: 'engagementStore.credits.snapshot',
					});
				}
			},
			(error) => {
				logError(error, {
					operation: 'engagementStore.credits.error',
				});
			},
		);
	},

	stopListening: () => {
		engagementUnsub?.();
		creditsUnsub?.();
		engagementUnsub = null;
		creditsUnsub = null;
		set({
			engagement: null,
			recentCredits: [],
			loading: false,
		});
	},

	canPerformAction: (action: string) => {
		return canUserPerformAction(get().engagement, action);
	},

	getLockedMessage: (action: string) => {
		return getLockedActionMessage(action);
	},

	isAlmostUnlocked: (action: string) => {
		return isAlmostUnlocked(get().engagement, action);
	},
}));
