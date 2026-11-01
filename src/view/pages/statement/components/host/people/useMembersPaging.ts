import { useCallback, useEffect, useState } from 'react';
import { StatementSubscription } from '@freedi/shared-types';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { countMembers, loadMembersPage } from '@/controllers/db/membership/membersPage';
import { FIREBASE } from '@/constants/common';
import { oldestCreatedAt } from './membersPaging';

export interface MembersPaging {
	/** Subscriptions in Firestore; null until the count arrives (or if it failed). */
	total: number | null;
	/** Firestore has people the list has not loaded yet. */
	hasMoreOnServer: boolean;
	isLoadingMore: boolean;
	loadFailed: boolean;
	/** Fetches the next older page; resolves once Redux has it. */
	loadMore: () => Promise<void>;
}

/**
 * Paging for the Members list beyond the live listener's first page: the
 * total comes from one count aggregation, older people from one-shot pages.
 */
export function useMembersPaging(
	statementId: string,
	members: ReadonlyArray<StatementSubscription>,
): MembersPaging {
	const dispatch = useAppDispatch();
	const [total, setTotal] = useState<number | null>(null);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [loadFailed, setLoadFailed] = useState(false);
	const [reachedEnd, setReachedEnd] = useState(false);

	useEffect(() => {
		let isCurrent = true;
		setTotal(null);
		setReachedEnd(false);
		countMembers(statementId)
			.then((count) => isCurrent && setTotal(count))
			.catch(() => undefined); // logged by the controller; paging stays off

		return () => {
			isCurrent = false;
		};
	}, [statementId]);

	const hasMoreOnServer = !reachedEnd && total !== null && members.length < total;

	const loadMore = useCallback(async (): Promise<void> => {
		const after = oldestCreatedAt(members);
		if (after === null || isLoadingMore) return;
		setIsLoadingMore(true);
		setLoadFailed(false);
		try {
			const pageSize = FIREBASE.QUERY_LIMIT_DEFAULT;
			const arrived = await loadMembersPage(dispatch)({
				statementId,
				afterCreatedAt: after,
				pageSize,
			});
			if (arrived < pageSize) setReachedEnd(true);
		} catch {
			setLoadFailed(true); // logged by the controller
		} finally {
			setIsLoadingMore(false);
		}
	}, [dispatch, statementId, members, isLoadingMore]);

	return { total, hasMoreOnServer, isLoadingMore, loadFailed, loadMore };
}
