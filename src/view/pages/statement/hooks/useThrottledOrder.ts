import { useEffect, useMemo, useRef, useState } from 'react';

function isSameOrder(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;

	return a.every((id, index) => id === b[index]);
}

function hasSameMembers(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const seen = new Set(a);

	return b.every((id) => seen.has(id));
}

interface ThrottledOrderOptions {
	/** Minimum gap between two applied reorders, in milliseconds. */
	intervalMs: number;
	/**
	 * Signature of the user's ordering *intent* (chosen sort, random seed,
	 * visible layers…). A change here bypasses the throttle, so tapping a sort
	 * button reorders instantly instead of waiting out the window.
	 */
	intentKey?: string;
}

/**
 * Coalesces rapid reorders of a list so a FLIP container re-measures — and
 * animates — at most once per `intervalMs`.
 *
 * Live evaluation updates can reshuffle a consensus ranking many times a
 * second. Animating every one of them made react-flip-toolkit call
 * getBoundingClientRect on each card repeatedly and froze the screen on mobile
 * during active deliberation, so the ordering used to be pinned altogether.
 * Throttling gives the reorder animation back without the measure-storm.
 *
 * Membership changes (a card added or removed) are applied immediately —
 * withholding a brand-new card reads as a bug — as are intent changes. Only
 * pure rank shuffles wait for the window.
 *
 * The returned array is rebuilt from `items` on every render, so card data
 * stays live; only the *positions* are held back.
 *
 * `getId` must be referentially stable — define it at module scope.
 */
export function useThrottledOrder<T>(
	items: T[],
	getId: (item: T) => string,
	{ intervalMs, intentKey = '' }: ThrottledOrderOptions,
): T[] {
	const [order, setOrder] = useState<string[]>(() => items.map(getId));
	const lastAppliedAtRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const intentRef = useRef(intentKey);
	const itemsRef = useRef(items);
	itemsRef.current = items;

	useEffect(() => {
		const intentChanged = intentRef.current !== intentKey;
		intentRef.current = intentKey;

		const nextOrder = items.map(getId);
		if (isSameOrder(order, nextOrder)) return;

		const clearPending = (): void => {
			if (timerRef.current === null) return;
			clearTimeout(timerRef.current);
			timerRef.current = null;
		};

		const apply = (ids: string[]): void => {
			lastAppliedAtRef.current = Date.now();
			setOrder(ids);
		};

		const elapsed = Date.now() - lastAppliedAtRef.current;
		if (intentChanged || !hasSameMembers(order, nextOrder) || elapsed >= intervalMs) {
			clearPending();
			apply(nextOrder);

			return;
		}

		// A rank shuffle inside the window: let the queued flush pick up whatever
		// the newest order is when it fires.
		if (timerRef.current !== null) return;
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			apply(itemsRef.current.map(getId));
		}, intervalMs - elapsed);
	}, [items, getId, order, intervalMs, intentKey]);

	useEffect(
		() => () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
		},
		[],
	);

	return useMemo(() => {
		const byId = new Map(items.map((item) => [getId(item), item]));
		const ordered = order.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);

		// Defensive: for the frame between new items arriving and the order state
		// catching up, render the newcomers rather than dropping them.
		if (ordered.length !== items.length) {
			const held = new Set(order);
			ordered.push(...items.filter((item) => !held.has(getId(item))));
		}

		return ordered;
	}, [items, getId, order]);
}
