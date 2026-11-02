import { useEffect, useMemo, useState } from 'react';
import { UI } from '@/constants/common';
import { countByFilter, MemberEntry, MemberFilter, selectMembers } from './membersLogic';
import { nextPageSize as pageSizeFor, planShowMore } from './membersPaging';
import { MembersPaging } from './useMembersPaging';

export interface MembersListState {
	filter: MemberFilter;
	setFilter: (filter: MemberFilter) => void;
	search: string;
	setSearch: (search: string) => void;
	counts: Record<MemberFilter, number>;
	/** Every loaded row the chip and search match, in order. */
	matching: MemberEntry[];
	/** The first page of `matching`. */
	shown: MemberEntry[];
	/** How many the next "Show more" adds. */
	nextPageSize: number;
	/** "{shown} of {total}": Firestore's total while the unfiltered list is still paging. */
	total: number;
	showMore: () => void;
}

/** Chip, debounced search and paging over the Members rows (UX 4.4). */
export function useMembersList(
	entries: ReadonlyArray<MemberEntry>,
	paging: MembersPaging,
): MembersListState {
	const [filter, setFilter] = useState<MemberFilter>('all');
	const [search, setSearch] = useState('');
	const [appliedSearch, setAppliedSearch] = useState('');
	const [displayCount, setDisplayCount] = useState<number>(UI.MEMBERS_INITIAL_COUNT);

	useEffect(() => {
		const timer = window.setTimeout(() => setAppliedSearch(search), UI.DEBOUNCE_DELAY);

		return () => window.clearTimeout(timer);
	}, [search]);

	useEffect(() => {
		setDisplayCount(UI.MEMBERS_INITIAL_COUNT);
	}, [filter, appliedSearch]);

	const counts = useMemo(() => countByFilter(entries), [entries]);
	const matching = useMemo(
		() => selectMembers(entries, filter, appliedSearch),
		[entries, filter, appliedSearch],
	);
	const shown = useMemo(() => matching.slice(0, displayCount), [matching, displayCount]);
	const plan = {
		shownCount: shown.length,
		matchingCount: matching.length,
		hasMoreOnServer: paging.hasMoreOnServer,
	};
	const isUnfiltered = filter === 'all' && appliedSearch === '';

	function showMore(): void {
		if (planShowMore(plan) === 'server') void paging.loadMore();
		setDisplayCount((count) => count + UI.MEMBERS_LOAD_MORE_COUNT);
	}

	return {
		filter,
		setFilter,
		search,
		setSearch,
		counts,
		matching,
		shown,
		nextPageSize: pageSizeFor(plan),
		total:
			isUnfiltered && paging.hasMoreOnServer && paging.total !== null
				? paging.total
				: matching.length,
		showMore,
	};
}
