import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
	fetchOlderTopSubscriptions,
	fetchOlderDiscussionSubscriptions,
} from '@/controllers/db/subscriptions/getSubscriptions';
import type { RootState } from '@/redux/store';
import { HOME } from '@/constants/common';
import { NON_DOCUMENT_STATEMENT_TYPES } from '@/helpers/statementTypeHelpers';
import { Role, StatementSubscription } from '@freedi/shared-types';

export type HomeTab = 'topics' | 'discussions';

const DISCUSSION_ROLES: ReadonlySet<Role> = new Set([Role.admin, Role.creator, Role.member]);

/**
 * True when a subscription belongs to the given home tab — kept in sync with the
 * listener/cursor queries so the pagination cursor is computed over exactly the
 * docs each query returns.
 *  - Topics:      top-level subscriptions (parentId === 'top')
 *  - Discussions: non-document statements where the user is admin/creator/member
 */
function matchesTab(sub: StatementSubscription, tab: HomeTab): boolean {
	if (tab === 'topics') {
		return (sub.parentId || sub.statement?.parentId) === 'top';
	}

	const statementType = sub.statementType || sub.statement?.statementType;

	return (
		!!statementType &&
		NON_DOCUMENT_STATEMENT_TYPES.includes(statementType) &&
		!!sub.role &&
		DISCUSSION_ROLES.has(sub.role)
	);
}

/**
 * Lazy-load older home-screen subscriptions as the user scrolls to the bottom.
 *
 * The home listeners subscribe to only the newest `HOME.INITIAL_SUBSCRIPTIONS_LIMIT`
 * subscriptions per tab. This hook pulls older batches (by `lastUpdate`, matching
 * the listener query) into the store via cursor pagination, driven by an
 * IntersectionObserver on a sentinel rendered at the end of the list.
 *
 * Cursor = the oldest loaded `lastUpdate` for the active tab. Display sort
 * (by latest child activity) is irrelevant to the cursor: each batch is merged
 * into the store and the view re-sorts. Rides the same composite indexes the
 * listeners already use, so no extra index is required.
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

	// Oldest loaded `lastUpdate` for the active tab, returned as a PRIMITIVE so
	// useSelector's reference equality holds and we avoid needless rerenders.
	const oldestLastUpdate = useSelector((state: RootState) => {
		let min = Infinity;
		for (const sub of state.statements.statementSubscription) {
			if (
				sub.userId === userId &&
				matchesTab(sub, tab) &&
				typeof sub.lastUpdate === 'number' &&
				sub.lastUpdate < min
			) {
				min = sub.lastUpdate;
			}
		}

		return min === Infinity ? null : min;
	});
	const oldestRef = useRef<number | null>(oldestLastUpdate);
	oldestRef.current = oldestLastUpdate;

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
		if (oldestRef.current === null) return;

		isLoadingRef.current = true;
		setIsLoadingMore(true);
		try {
			const fetcher =
				tab === 'topics' ? fetchOlderTopSubscriptions : fetchOlderDiscussionSubscriptions;
			const result = await fetcher(userId, oldestRef.current, HOME.LOAD_MORE_BATCH_SIZE);
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
				{ rootMargin: '400px' },
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
