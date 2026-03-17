import { useMemo } from 'react';
import { useAppSelector } from './reduxHooks';
import { userEngagementSelector } from '@/redux/engagement/engagementSlice';
import {
	canUserPerformAction,
	getLockedActionMessage,
	isAlmostUnlocked,
} from '@freedi/engagement-core';

interface PermissionGateResult {
	/** Whether the user can perform this action */
	allowed: boolean;
	/** User-friendly message explaining why the action is locked */
	lockedMessage: string;
	/** Whether the user is close to unlocking (within 80% progress) */
	almostUnlocked: boolean;
}

/**
 * Hook to check if the current user has permission to perform an action
 * based on their engagement level.
 *
 * @param action - The action to check (e.g., 'evaluate', 'create_option')
 */
export function usePermissionGate(action: string): PermissionGateResult {
	const engagement = useAppSelector(userEngagementSelector);

	return useMemo(() => {
		const allowed = canUserPerformAction(engagement, action);
		const lockedMessage = allowed ? '' : getLockedActionMessage(action);
		const almostUnlocked = !allowed && isAlmostUnlocked(engagement, action);

		return { allowed, lockedMessage, almostUnlocked };
	}, [engagement, action]);
}
