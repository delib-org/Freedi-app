import { useEffect, useRef } from 'react';
import { fetchMessageCounts } from '@/controllers/db/statements/fetchMessageCounts';
import { CACHE } from '@/constants/common';

/** statementId -> when its counter was last read (module level, survives Home remounts). */
const lastReadAt = new Map<string, number>();

/** Forgets what was read (tests). */
export function resetFreshMessageCountsCache(): void {
	lastReadAt.clear();
}

/**
 * Keeps the message counter of Home's cards fresh without a listener. A card
 * is read when it first appears (the lazy loader adds ids as the person
 * scrolls) and not again within CACHE.SHORT_TTL, so quick trips back and
 * forth between Home and a card cost nothing.
 */
export function useFreshMessageCounts(statementIds: string[]): void {
	const signature = statementIds.join('|');
	const requestedRef = useRef(new Set<string>());

	useEffect(() => {
		const now = Date.now();
		const fresh = statementIds.filter((id) => {
			if (requestedRef.current.has(id)) return false;
			const last = lastReadAt.get(id);

			return last === undefined || now - last >= CACHE.SHORT_TTL;
		});
		if (fresh.length === 0) return;
		fresh.forEach((id) => {
			requestedRef.current.add(id);
			lastReadAt.set(id, now);
		});
		void fetchMessageCounts(fresh);
		// The signature stands for statementIds.
	}, [signature]);
}
