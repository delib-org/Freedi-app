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
	const loadedCount = useSelector(
		(state: RootState) =>
			state.statements.statements.filter((s) => s.parentId === statementId).length,
	);
	const oldestRef = useRef<number | null>(oldestCreatedAt);
	oldestRef.current = oldestCreatedAt;

	// Reset paging state when navigating to a different statement.
	useEffect(() => {
		setHasMore(true);
		hasMoreRef.current = true;
		setIsLoadingMore(false);
		isLoadingRef.current = false;
	}, [statementId]);

	// If fewer than a full window are loaded, everything is already here.
	useEffect(() => {
		if (loadedCount > 0 && loadedCount < CHAT.INITIAL_MESSAGES_LIMIT) {
			setHasMore(false);
			hasMoreRef.current = false;
		}
	}, [loadedCount]);

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

	useEffect(() => () => observerRef.current?.disconnect(), []);

	return { sentinelRef, isLoadingMore, hasMore };
}
