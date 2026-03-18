import { useEffect, useRef } from 'react';
import { useAppSelector } from './reduxHooks';
import {
	userEngagementSelector,
	engagementLoadingSelector,
	recentCreditsSelector,
	userLevelSelector,
	totalCreditsSelector,
	userBadgesSelector,
	currentStreakSelector,
	isTrialModeSelector,
} from '@/redux/engagement/engagementSlice';
import {
	listenToUserEngagement,
	listenToRecentCredits,
} from '@/controllers/db/engagement/db_engagement';
import { getLevelProgress, getLevelName, getNextLevelThreshold } from '@freedi/engagement-core';

/**
 * Hook to subscribe to the current user's engagement data.
 * Sets up Firestore listeners that dispatch to Redux.
 */
export function useEngagement() {
	const unsubEngagementRef = useRef<(() => void) | null>(null);
	const unsubCreditsRef = useRef<(() => void) | null>(null);

	const engagement = useAppSelector(userEngagementSelector);
	const loading = useAppSelector(engagementLoadingSelector);
	const recentCredits = useAppSelector(recentCreditsSelector);
	const level = useAppSelector(userLevelSelector);
	const totalCredits = useAppSelector(totalCreditsSelector);
	const badges = useAppSelector(userBadgesSelector);
	const currentStreak = useAppSelector(currentStreakSelector);
	const isTrialMode = useAppSelector(isTrialModeSelector);

	useEffect(() => {
		unsubEngagementRef.current = listenToUserEngagement();
		unsubCreditsRef.current = listenToRecentCredits();

		return () => {
			unsubEngagementRef.current?.();
			unsubCreditsRef.current?.();
		};
	}, []);

	const levelName = getLevelName(level);
	const levelProgress = getLevelProgress(totalCredits, level);
	const nextLevelThreshold = getNextLevelThreshold(level);

	return {
		engagement,
		loading,
		recentCredits,
		level,
		levelName,
		levelProgress,
		nextLevelThreshold,
		totalCredits,
		badges,
		currentStreak,
		isTrialMode,
	};
}
