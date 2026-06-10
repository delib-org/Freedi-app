import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { fetchOlderSubStatements } from '@/controllers/db/statements/listenToStatements';
import type { RootState } from '@/redux/store';
import { CHAT } from '@/constants/common';

/**
 * Lazy-load older sub-statements (options) as the user scrolls to the bottom of
 * the evaluations/options list.
 *
 * The statement page subscribes to only the newest `CHAT.INITIAL_MESSAGES_LIMIT`
 * children (the chat-style window). The flat options view has no pagination of
 * its own, so a question with more options than the window shows a truncated
 * list. This hook reuses the same `fetchOlderSubStatements` cursor pagination
 * the Chat view uses — pulling older batches (by `createdAt`) into the store —
 * driven by an IntersectionObserver on a sentinel element rendered at the end
 * of the list.
 *
 * Cursor = the oldest loaded `createdAt` for this parent. Display sort is
 * irrelevant to the cursor: each batch is merged into the store and the view
 * re-sorts. `hide` is filtered downstream by the card selector (consistent with
 * the listener), so this needs no extra composite index — it rides the existing
 * `(parentId, createdAt)` index.
 */
export function useLazyLoadOptions(statementId: string | undefined): {
	sentinelRef: (node: HTMLElement | null) => void;
	isLoadingMore: boolean;
	hasMore: boolean;
} {
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const isLoadingRef = useRef(false);
	const hasMoreRef = useRef(true);
	const observerRef = useRef<IntersectionObserver | null>(null);

	// Oldest loaded createdAt + loaded count for this parent. Two separate
	// selectors returning PRIMITIVES (not a new object) so useSelector's default
	// reference equality holds and we don't trigger "selector returned a
	// different result" / unnecessary rerenders.
	const oldestCreatedAt = useSelector((state: RootState) => {
		let min = Infinity;
		for (const s of state.statements.statements) {
			if (s.parentId === statementId && typeof s.createdAt === 'number' && s.createdAt < min) {
				min = s.createdAt;
			}
		}

		return min === Infinity ? null : min;
	});
	const oldestRef = useRef<number | null>(oldestCreatedAt);
	oldestRef.current = oldestCreatedAt;

	// Reset paging state when navigating to a different statement.
	// We do NOT pre-decide `hasMore` from the loaded count: that was sticky
	// (a transient sub-window count set it false and it never recovered). Let
	// `fetchOlderSubStatements`'s own `hasMore` result drive it — at worst one
	// cheap extra query when there is nothing older.
	useEffect(() => {
		setHasMore(true);
		hasMoreRef.current = true;
		setIsLoadingMore(false);
		isLoadingRef.current = false;
	}, [statementId]);

	const loadMore = useCallback(async () => {
		if (!statementId || isLoadingRef.current || !hasMoreRef.current) return;
		if (oldestRef.current === null) return;

		isLoadingRef.current = true;
		setIsLoadingMore(true);
		try {
			const result = await fetchOlderSubStatements(
				statementId,
				oldestRef.current,
				CHAT.LOAD_MORE_BATCH_SIZE,
			);
			hasMoreRef.current = result.hasMore;
			setHasMore(result.hasMore);
		} finally {
			isLoadingRef.current = false;
			setIsLoadingMore(false);
		}
	}, [statementId]);

	// Observe the sentinel; load the next batch when it scrolls into view.
	const sentinelRef = useCallback(
		(node: HTMLElement | null) => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
			if (!node) return;
			observerRef.current = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting)) void loadMore();
				},
				{ rootMargin: '400px' },
			);
			observerRef.current.observe(node);
		},
		[loadMore],
	);
	// NOTE: cleanup is handled by the callback ref itself — React invokes it with
	// `null` on unmount (and with the new node on replace), and we disconnect there.
	// A separate `useEffect(() => () => disconnect())` is redundant AND breaks under
	// StrictMode: its cleanup runs during the dev double-invoke and disconnects the
	// just-attached observer, after which the ref isn't re-invoked — so it never fires.

	return { sentinelRef, isLoadingMore, hasMore };
}
