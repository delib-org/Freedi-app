import { useEffect, useRef, useState, useCallback } from 'react';
import { CreditAction } from '@freedi/shared-types';
import type { CreditTransaction } from '@freedi/shared-types';
import { useAppSelector } from './reduxHooks';
import { recentCreditsSelector } from '@/redux/engagement/engagementSlice';

interface CreditAnimationItem {
	id: string;
	amount: number;
}

/**
 * Credits that never get a toast. Rating and voting are moments of judgement,
 * so no reward appears around them; login and streak credits reward coming
 * back rather than taking part. They still count and show in My Impact.
 */
const SILENT_CREDIT_ACTIONS: ReadonlySet<CreditAction> = new Set([
	CreditAction.EVALUATE_OPTION,
	CreditAction.VOTE,
	CreditAction.MC_PARTICIPATION,
	CreditAction.DAILY_LOGIN,
	CreditAction.STREAK_BONUS,
]);

/**
 * The newest credit that arrived between two listener snapshots and may be
 * toasted, or null. The list is newest-first and capped, so its length stops
 * changing once it is full: arrival is detected from the newest id instead.
 * An empty `previous` is the first load, which never animates.
 */
export function findCreditToToast(
	previous: CreditTransaction[],
	current: CreditTransaction[],
): CreditTransaction | null {
	const previousNewest = previous[0];
	if (!previousNewest || current[0]?.transactionId === previousNewest.transactionId) {
		return null;
	}

	const knownIds = new Set(previous.map((credit) => credit.transactionId));
	// The date check skips older rows that slide into the capped window when
	// a newer row is removed.
	const arrived = current.filter(
		(credit) => !knownIds.has(credit.transactionId) && credit.createdAt >= previousNewest.createdAt,
	);

	return arrived.find((credit) => !SILENT_CREDIT_ACTIONS.has(credit.action)) ?? null;
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
		const credit = findCreditToToast(prevCreditsRef.current, recentCredits);
		if (credit) {
			setToast({ id: credit.transactionId, amount: credit.amount });
		}

		prevCreditsRef.current = recentCredits;
	}, [recentCredits]);

	const dismissToast = useCallback(() => {
		setToast(null);
	}, []);

	return { toast, dismissToast };
}
