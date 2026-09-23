import { SortType } from '@freedi/shared-types';

/**
 * Pure decisions behind the answers-tab sort control: which orderings a
 * question offers, which one the reader is on, and the URL that selects one.
 * The URL shape is the one SuggestionCards reads (`/:base/:id/:sort?tab=…`,
 * random carries a `t=` seed so re-picking it reshuffles).
 */

export interface AnswerSortOption {
	id: SortType;
	labelKey: string;
}

const ALL_SORT_OPTIONS: ReadonlyArray<AnswerSortOption> = [
	{ id: SortType.newest, labelKey: 'Newest first' },
	{ id: SortType.mostUpdated, labelKey: 'Most updated' },
	{ id: SortType.mostJoined, labelKey: 'Most joined' },
	{ id: SortType.random, labelKey: 'Random' },
	{ id: SortType.accepted, labelKey: 'By agreement' },
];

export interface SortOptionSettings {
	/** Ratings are visible to participants; without them "by agreement" says nothing. */
	showEvaluation: boolean;
	/** Joining replaces "most updated" with "most joined". */
	joiningEnabled: boolean;
}

export function getAnswerSortOptions({
	showEvaluation,
	joiningEnabled,
}: SortOptionSettings): AnswerSortOption[] {
	return ALL_SORT_OPTIONS.filter((option) => {
		if (option.id === SortType.accepted && !showEvaluation) return false;
		if (option.id === SortType.mostJoined && !joiningEnabled) return false;
		if (option.id === SortType.mostUpdated && joiningEnabled) return false;

		return true;
	});
}

/** Two answers is the first list with an order worth choosing. */
export function hasEnoughAnswersToSort(optionCount: number, childCount: number): boolean {
	return optionCount >= 2 || childCount >= 2;
}

export interface CurrentSortArgs {
	/** The `:sort` route segment, when the reader asked for one. */
	paramSort: string | undefined;
	/** The host's default ordering for this question. */
	defaultSort: SortType | undefined;
	/** A hand-placed order replaces the ranking while no `:sort` is in the URL. */
	hasManualOrder: boolean;
}

export type CurrentSort = { kind: 'sort'; sort: SortType } | { kind: 'manual' };

function isSortType(value: string | undefined): value is SortType {
	return !!value && (Object.values(SortType) as string[]).includes(value);
}

export function resolveCurrentSort({
	paramSort,
	defaultSort,
	hasManualOrder,
}: CurrentSortArgs): CurrentSort {
	if (isSortType(paramSort)) return { kind: 'sort', sort: paramSort };
	if (hasManualOrder) return { kind: 'manual' };

	return { kind: 'sort', sort: defaultSort ?? SortType.newest };
}

/** `/stage/…` keeps its family; everything else sorts under `/statement/…`. */
export function sortRouteBase(pathname: string): 'stage' | 'statement' {
	return pathname.includes('/stage/') ? 'stage' : 'statement';
}

export interface SortPathArgs {
	pathname: string;
	statementId: string;
	sort: SortType;
	tab: string | null;
	/** Seed for a random order; defaults to now. */
	now?: number;
}

export function buildAnswerSortPath({
	pathname,
	statementId,
	sort,
	tab,
	now,
}: SortPathArgs): string {
	const params = new URLSearchParams();
	if (tab) params.set('tab', tab);
	if (sort === SortType.random) params.set('t', String(now ?? Date.now()));
	const query = params.toString();

	return `/${sortRouteBase(pathname)}/${statementId}/${sort}${query ? `?${query}` : ''}`;
}
