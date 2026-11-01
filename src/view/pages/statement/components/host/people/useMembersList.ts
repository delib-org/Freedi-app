import { useEffect, useMemo, useState } from 'react';
import { UI } from '@/constants/common';
import { countByFilter, MemberEntry, MemberFilter, selectMembers } from './membersLogic';

export interface MembersListState {
	filter: MemberFilter;
	setFilter: (filter: MemberFilter) => void;
	search: string;
	setSearch: (search: string) => void;
	counts: Record<MemberFilter, number>;
	/** Every row the chip and search match, in order. */
	matching: MemberEntry[];
	/** The first page of `matching`. */
	shown: MemberEntry[];
	/** How many the next "Show more" adds. */
	nextPageSize: number;
	showMore: () => void;
}

/** Chip, debounced search and paging over the Members rows (UX 4.4). */
export function useMembersList(entries: ReadonlyArray<MemberEntry>): MembersListState {
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
	const nextPageSize = Math.min(UI.MEMBERS_LOAD_MORE_COUNT, matching.length - shown.length);

	return {
		filter,
		setFilter,
		search,
		setSearch,
		counts,
		matching,
		shown,
		nextPageSize,
		showMore: () => setDisplayCount((count) => count + UI.MEMBERS_LOAD_MORE_COUNT),
	};
}
