import { useMemo, useCallback } from 'react';
import { useAppSelector } from './reduxHooks';
import { NotificationFrequency } from '@freedi/shared-types';
import type { StatementSubscription } from '@freedi/shared-types';
import {
	updateBranchPreference,
	updateSubscriptionFrequency,
} from '@/controllers/db/engagement/db_branchPreferences';
import type { BranchBellState } from '@/view/components/atomic/atoms/BranchBell/BranchBell';

/**
 * Hook to manage branch notification bell state.
 * Reads the current frequency from the subscription data and provides
 * a handler to update it.
 *
 * @param topParentId - The top-level discussion ID
 * @param branchId - The specific branch statement ID (optional - if omitted, controls the whole discussion)
 */
export function useBranchBell(
	topParentId: string,
	branchId?: string,
): {
	state: BranchBellState;
	onFrequencyChange: (frequency: NotificationFrequency) => void;
} {
	const subscriptions = useAppSelector(
		(state) => state.statements.statementSubscription,
	);

	const state = useMemo((): BranchBellState => {
		const subscription = subscriptions.find(
			(sub: StatementSubscription) => sub.statementId === topParentId,
		);

		if (!subscription) return 'unsubscribed';

		// Check branch-specific preference first
		if (branchId && subscription.branchPreferences?.[branchId]) {
			return frequencyToState(subscription.branchPreferences[branchId].frequency);
		}

		// Fall back to discussion-level preference
		if (subscription.notificationFrequency) {
			return frequencyToState(subscription.notificationFrequency);
		}

		// Default: subscribed with instant
		return 'instant';
	}, [subscriptions, topParentId, branchId]);

	const onFrequencyChange = useCallback(
		(frequency: NotificationFrequency) => {
			if (branchId) {
				updateBranchPreference(topParentId, branchId, frequency);
			} else {
				updateSubscriptionFrequency(topParentId, frequency);
			}
		},
		[topParentId, branchId],
	);

	return { state, onFrequencyChange };
}

function frequencyToState(freq: NotificationFrequency): BranchBellState {
	switch (freq) {
		case NotificationFrequency.INSTANT:
			return 'instant';
		case NotificationFrequency.DAILY:
			return 'daily';
		case NotificationFrequency.WEEKLY:
			return 'weekly';
		case NotificationFrequency.NONE:
			return 'muted';
		default:
			return 'unsubscribed';
	}
}
