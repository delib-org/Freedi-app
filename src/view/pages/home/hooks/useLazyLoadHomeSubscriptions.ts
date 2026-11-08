import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { fetchOlderDiscussionSubscriptions } from '@/controllers/db/subscriptions/getSubscriptions';
import { getDiscussionsCursor } from '@/controllers/db/subscriptions/discussionsCursor';
import { fetchOlderUserFeed } from '@/controllers/db/userFeed/listenToUserFeed';
import type { RootState } from '@/redux/store';
import { selectOldestUserFeedActivity } from '@/redux/userFeed/userFeedSlice';
import { HOME } from '@/constants/common';

export type HomeTab = 'topics' | 'discussions';

/**
 * Nearest scrollable ancestor of `node`, used as the IntersectionObserver root.
 * The home list scrolls inside `.home-page__main` (overflow-y: auto), not the
 * document — with `root: null` the observer can fail to fire for an inner
 * scroller. Anchoring the root to the real scroll container makes it reliable.
 */
function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
	let el = node?.parentElement ?? null;
	while (el) {
		const { overflowY } = getComputedStyle(el);
		if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
			return el;
		}
		el = el.parentElement;
	}

	return null;
}

/**
 * Lazy-load older home-screen subscriptions as the user scrolls to the bottom.
 *
 * The home listeners subscribe to only the first `HOME.INITIAL_SUBSCRIPTIONS_LIMIT`
 * entries per tab. This hook pulls older batches into the store via cursor
 * pagination, driven by an IntersectionObserver on a sentinel at the end of the list.
 *  - Topics:      the next `userFeed` page by lastActivity, then those subscriptions.
 *  - Discussions: the next subscriptions page by lastUpdate.
 *
 * Display sort (by latest activity) is irrelevant to the cursor: each batch is
 * merged into the store and the view re-sorts.
 */
export function useLazyLoadHomeSubscriptions(tab: HomeTab): {
	sentinelRef: (node: HTMLElement | null) => void;
	isLoadingMore: boolean;
	hasMore: boolean;
} {
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const isLoadingRef = useRef(false);
	const hasMoreRef = useRef(true);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const userId = useSelector((state: RootState) => state.creator.creator?.uid);

	// Topics page by activity (userFeed.lastActivity); its cursor is the oldest
	// loaded feed entry — a PRIMITIVE so useSelector's equality holds.
	// Discussions page by subscription lastUpdate; their cursor is tracked from
	// the query results (see discussionsCursor.ts), read when loading.
	const oldestFeedActivity = useSelector(selectOldestUserFeedActivity);
	const oldestRef = useRef<number | null>(oldestFeedActivity);
	oldestRef.current = oldestFeedActivity;

	// Reset paging state when the active tab changes. We don't pre-decide
	// `hasMore` from the loaded count — let the fetch's own `hasMore` drive it
	// (at worst one cheap extra query when there is nothing older).
	useEffect(() => {
		setHasMore(true);
		hasMoreRef.current = true;
		setIsLoadingMore(false);
		isLoadingRef.current = false;
	}, [tab]);

	const loadMore = useCallback(async () => {
		if (!userId || isLoadingRef.current || !hasMoreRef.current) return;
		const cursor = tab === 'topics' ? oldestRef.current : getDiscussionsCursor();
		if (cursor === null) return;

		isLoadingRef.current = true;
		setIsLoadingMore(true);
		try {
			const fetcher = tab === 'topics' ? fetchOlderUserFeed : fetchOlderDiscussionSubscriptions;
			const result = await fetcher(userId, cursor, HOME.LOAD_MORE_BATCH_SIZE);
			hasMoreRef.current = result.hasMore;
			setHasMore(result.hasMore);
		} finally {
			isLoadingRef.current = false;
			setIsLoadingMore(false);
		}
	}, [tab, userId]);

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
				{ root: getScrollableAncestor(node), rootMargin: '400px' },
			);
			observerRef.current.observe(node);
		},
		[loadMore],
	);
	// Cleanup is handled by the callback ref itself — React invokes it with `null`
	// on unmount (mirrors useLazyLoadOptions, avoids the StrictMode double-invoke
	// pitfall of a separate effect cleanup).

	return { sentinelRef, isLoadingMore, hasMore };
}
