import { useEffect, useRef, useState, useCallback } from 'react';
import { CreditAction } from '@freedi/shared-types';
import type { CreditTransaction } from '@freedi/shared-types';
import { useAppSelector } from './reduxHooks';
import { recentCreditsSelector } from '@/redux/engagement/engagementSlice';
import { STORAGE_KEYS, TIME } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

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
 * The newest credit that may be toasted, or null. The list is newest-first and
 * capped, so its length stops changing once it is full: arrival is detected
 * from the newest id instead.
 *
 * `lastToastedId` is what this person was last shown: null when nothing was,
 * undefined when that cannot be known because storage is unavailable. Rows at
 * or below that id never toast, so a first snapshot can toast a credit earned
 * away from Home without repeating on a reload. When the memory is unavailable
 * an empty `previous` only sets the baseline, as no repeat could be prevented.
 * A later snapshot can still add rows the person did not just earn, such as
 * server data replacing a cached list, so a credit is toasted only when recent.
 */
export function findCreditToToast(
	previous: CreditTransaction[],
	current: CreditTransaction[],
	now: number,
	lastToastedId?: string | null,
): CreditTransaction | null {
	const previousNewest = previous[0];
	const hasNoBaseline = !previousNewest && lastToastedId === undefined;
	const isUnchanged = current[0]?.transactionId === previousNewest?.transactionId;
	if (hasNoBaseline || isUnchanged) {
		return null;
	}

	const lastToastedIndex = current.findIndex((credit) => credit.transactionId === lastToastedId);
	const notYetToasted = lastToastedIndex < 0 ? current : current.slice(0, lastToastedIndex);
	const knownIds = new Set(previous.map((credit) => credit.transactionId));
	// The date check skips older rows that slide into the capped window when
	// a newer row is removed.
	const arrived = notYetToasted.filter(
		(credit) =>
			!knownIds.has(credit.transactionId) &&
			(!previousNewest || credit.createdAt >= previousNewest.createdAt),
	);

	return (
		arrived.find(
			(credit) => !SILENT_CREDIT_ACTIONS.has(credit.action) && now - credit.createdAt <= TIME.HOUR,
		) ?? null
	);
}

function lastToastedStorageKey(userId: string): string {
	return `${STORAGE_KEYS.LAST_TOASTED_CREDIT}_${userId}`;
}

/** The id last toasted for this user; undefined when storage cannot be read. */
function readLastToastedId(userId: string): string | null | undefined {
	try {
		return localStorage.getItem(lastToastedStorageKey(userId));
	} catch (error) {
		logError(error, { operation: 'hooks.useCreditAnimation.readLastToastedId', userId });

		return undefined;
	}
}

function rememberToastedCredit(credit: CreditTransaction): void {
	try {
		localStorage.setItem(lastToastedStorageKey(credit.userId), credit.transactionId);
	} catch (error) {
		logError(error, {
			operation: 'hooks.useCreditAnimation.rememberToastedCredit',
			userId: credit.userId,
		});
	}
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
		const owner = recentCredits[0]?.userId;
		const lastToastedId = owner === undefined ? undefined : readLastToastedId(owner);
		const credit = findCreditToToast(
			prevCreditsRef.current,
			recentCredits,
			Date.now(),
			lastToastedId,
		);
		if (credit) {
			rememberToastedCredit(credit);
			setToast({ id: credit.transactionId, amount: credit.amount });
		}

		prevCreditsRef.current = recentCredits;
	}, [recentCredits]);

	const dismissToast = useCallback(() => {
		setToast(null);
	}, []);

	return { toast, dismissToast };
}
