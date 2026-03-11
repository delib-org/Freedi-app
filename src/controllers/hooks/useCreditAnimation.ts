import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppSelector } from './reduxHooks';
import { recentCreditsSelector } from '@/redux/engagement/engagementSlice';
import type { CreditTransaction } from '@freedi/shared-types';

interface CreditAnimationItem {
	id: string;
	amount: number;
}

/**
 * Hook that detects new credit transactions and surfaces them for toast animations.
 * Returns the latest toast to display + a dismiss callback.
 */
export function useCreditAnimation() {
	const recentCredits = useAppSelector(recentCreditsSelector);
	const prevCreditsRef = useRef<CreditTransaction[]>([]);
	const [toast, setToast] = useState<CreditAnimationItem | null>(null);

	useEffect(() => {
		const prev = prevCreditsRef.current;
		if (prev.length === 0 && recentCredits.length > 0) {
			// Initial load, don't animate
			prevCreditsRef.current = recentCredits;

			return;
		}

		if (recentCredits.length > prev.length) {
			// Find new transactions (ones not in prev)
			const prevIds = new Set(prev.map((c) => c.transactionId));
			const newCredits = recentCredits.filter((c) => !prevIds.has(c.transactionId));

			if (newCredits.length > 0) {
				const latest = newCredits[0];
				setToast({ id: latest.transactionId, amount: latest.amount });
			}
		}

		prevCreditsRef.current = recentCredits;
	}, [recentCredits]);

	const dismissToast = useCallback(() => {
		setToast(null);
	}, []);

	return { toast, dismissToast };
}
