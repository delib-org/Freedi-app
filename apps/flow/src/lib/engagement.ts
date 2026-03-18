/**
 * Engagement adapter for Flow app (Mithril.js).
 * Uses Firestore onSnapshot with manual Mithril redraws.
 */

import {
	doc,
	onSnapshot,
	getFirestore,
	type Unsubscribe,
} from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import type { UserEngagement } from '@freedi/shared-types';
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
import m from 'mithril';

// Module-level state (Mithril pattern - no stores, just module state + redraw)
let currentEngagement: UserEngagement | null = null;
let engagementLoading = true;
let engagementUnsub: Unsubscribe | null = null;

/**
 * Start listening to a user's engagement data.
 * Call this when the user authenticates.
 */
export function startEngagementListener(userId: string): void {
	stopEngagementListener();

	engagementLoading = true;
	m.redraw();

	const db = getFirestore();
	const engagementRef = doc(db, Collections.userEngagement, userId);

	engagementUnsub = onSnapshot(
		engagementRef,
		(snapshot) => {
			if (snapshot.exists()) {
				const data = snapshot.data();
				currentEngagement = {
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
			} else {
				currentEngagement = null;
			}
			engagementLoading = false;
			m.redraw();
		},
		() => {
			engagementLoading = false;
			m.redraw();
		},
	);
}

/**
 * Stop listening to engagement data.
 * Call this on logout.
 */
export function stopEngagementListener(): void {
	engagementUnsub?.();
	engagementUnsub = null;
	currentEngagement = null;
	engagementLoading = true;
}

// Read-only accessors

export function getEngagement(): UserEngagement | null {
	return currentEngagement;
}

export function isEngagementLoading(): boolean {
	return engagementLoading;
}

export function getUserLevel(): EngagementLevel {
	return currentEngagement?.level ?? EngagementLevel.OBSERVER;
}

export function getUserLevelName(): string {
	return getLevelName(getUserLevel());
}

export function getUserLevelProgress(): number {
	const credits = currentEngagement?.totalCredits ?? 0;

	return getLevelProgress(credits, getUserLevel());
}

export function getNextThreshold(): number {
	return getNextLevelThreshold(getUserLevel());
}

export function getTotalCredits(): number {
	return currentEngagement?.totalCredits ?? 0;
}

export function getCurrentStreak(): number {
	return currentEngagement?.streak?.currentStreak ?? 0;
}

export function canPerformAction(action: string): boolean {
	return canUserPerformAction(currentEngagement, action);
}

export function getActionLockedMessage(action: string): string {
	return getLockedActionMessage(action);
}

export function isActionAlmostUnlocked(action: string): boolean {
	return isAlmostUnlocked(currentEngagement, action);
}
