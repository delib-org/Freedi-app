import { useEffect, useRef } from 'react';
import { fetchMessageCounts } from '@/controllers/db/statements/fetchMessageCounts';

/**
 * Keeps the message counter of Home's cards fresh without a listener: each id
 * is read once per mount, when it first appears (the lazy loader adds ids as
 * the person scrolls, so a long list never costs more than what is shown).
 */
export function useFreshMessageCounts(statementIds: string[]): void {
	const requestedRef = useRef(new Set<string>());
	const signature = statementIds.join('|');

	useEffect(() => {
		const fresh = statementIds.filter((id) => !requestedRef.current.has(id));
		if (fresh.length === 0) return;
		fresh.forEach((id) => requestedRef.current.add(id));
		void fetchMessageCounts(fresh);
		// The signature stands for statementIds.
	}, [signature]);
}
