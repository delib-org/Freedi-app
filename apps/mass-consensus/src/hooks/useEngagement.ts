/**
 * Engagement hook for Mass Consensus app.
 * Uses React state directly (no Redux for engagement data).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { db } from '@/lib/firebase/client';
import { Collections } from '@freedi/shared-types';
import type { UserEngagement, CreditTransaction, Badge } from '@freedi/shared-types';
import { EngagementLevel } from '@freedi/shared-types';
import {
	getLevelName,
	getLevelProgress,
	getNextLevelThreshold,
	canUserPerformAction,
	getLockedActionMessage,
	isAlmostUnlocked,
} from '@freedi/engagement-core';
import { logError } from '@/lib/utils/errorHandling';

interface EngagementData {
	engagement: UserEngagement | null;
	recentCredits: CreditTransaction[];
	loading: boolean;
	level: EngagementLevel;
	levelName: string;
	levelProgress: number;
	nextLevelThreshold: number;
	totalCredits: number;
	badges: Badge[];
	currentStreak: number;
	isTrialMode: boolean;
	canPerformAction: (action: string) => boolean;
	getLockedMessage: (action: string) => string;
	isAlmostUnlocked: (action: string) => boolean;
}

export function useEngagement(userId: string | null): EngagementData {
	const [engagement, setEngagement] = useState<UserEngagement | null>(null);
	const [recentCredits, setRecentCredits] = useState<CreditTransaction[]>([]);
	const [loading, setLoading] = useState(true);
	const unsubEngagementRef = useRef<Unsubscribe | null>(null);
	const unsubCreditsRef = useRef<Unsubscribe | null>(null);

	useEffect(() => {
		if (!userId) {
			setEngagement(null);
			setRecentCredits([]);
			setLoading(false);

			return;
		}

		setLoading(true);

		// Listen to user engagement doc
		const engagementRef = doc(db, Collections.userEngagement, userId);
		unsubEngagementRef.current = onSnapshot(
			engagementRef,
			(snapshot) => {
				try {
					if (snapshot.exists()) {
						const data = snapshot.data();
						setEngagement({
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
						} as UserEngagement);
					} else {
						setEngagement(null);
					}
					setLoading(false);
				} catch (error) {
					logError(error, {
						operation: 'useEngagement.snapshot',
					});
					setLoading(false);
				}
			},
			(error) => {
				logError(error, { operation: 'useEngagement.error' });
				setLoading(false);
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

		unsubCreditsRef.current = onSnapshot(
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
					setRecentCredits(credits);
				} catch (error) {
					logError(error, {
						operation: 'useEngagement.credits.snapshot',
					});
				}
			},
			(error) => {
				logError(error, { operation: 'useEngagement.credits.error' });
			},
		);

		return () => {
			unsubEngagementRef.current?.();
			unsubCreditsRef.current?.();
		};
	}, [userId]);

	const level = engagement?.level ?? EngagementLevel.OBSERVER;
	const totalCredits = engagement?.totalCredits ?? 0;

	const canPerform = useCallback(
		(action: string) => canUserPerformAction(engagement, action),
		[engagement],
	);

	const getLockedMsg = useCallback(
		(action: string) => getLockedActionMessage(action),
		[],
	);

	const isAlmostUnlockedFn = useCallback(
		(action: string) => isAlmostUnlocked(engagement, action),
		[engagement],
	);

	return {
		engagement,
		recentCredits,
		loading,
		level,
		levelName: getLevelName(level),
		levelProgress: getLevelProgress(totalCredits, level),
		nextLevelThreshold: getNextLevelThreshold(level),
		totalCredits,
		badges: engagement?.badges ?? [],
		currentStreak: engagement?.streak?.currentStreak ?? 0,
		isTrialMode:
			!!engagement?.trialModeActive &&
			!!engagement?.trialModeExpiresAt &&
			Date.now() < engagement.trialModeExpiresAt,
		canPerformAction: canPerform,
		getLockedMessage: getLockedMsg,
		isAlmostUnlocked: isAlmostUnlockedFn,
	};
}
