import { useEffect } from 'react';
import { fetchTreeSubscriptions } from '@/controllers/db/subscriptions/fetchTreeSubscriptions';

/** Loads what this person has seen in a discussion tree, once per tree per session. */
export function useTreeSeenMarkers(
	userId: string | undefined,
	topParentId: string | undefined,
): void {
	useEffect(() => {
		if (userId && topParentId) void fetchTreeSubscriptions(userId, topParentId);
	}, [userId, topParentId]);
}
