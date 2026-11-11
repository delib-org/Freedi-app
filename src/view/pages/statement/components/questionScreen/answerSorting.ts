import { SortType } from '@freedi/shared-types';
import { guardScoreSort, isScoreOrderedSort } from './canSeeScore';

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
	/** The score guard lets this viewer see question-wide results. */
	canSortByScore: boolean;
	/** Joining replaces "most updated" with "most joined". */
	joiningEnabled: boolean;
}

export function getAnswerSortOptions({
	canSortByScore,
	joiningEnabled,
}: SortOptionSettings): AnswerSortOption[] {
	return ALL_SORT_OPTIONS.filter((option) => {
		if (isScoreOrderedSort(option.id) && !canSortByScore) return false;
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
	/** Without it a saved or linked score order must not rank the list for this viewer. */
	canSortByScore: boolean;
}

export type CurrentSort = { kind: 'sort'; sort: SortType } | { kind: 'manual' };

function isSortType(value: string | undefined): value is SortType {
	return !!value && (Object.values(SortType) as string[]).includes(value);
}

export function resolveCurrentSort({
	paramSort,
	defaultSort,
	hasManualOrder,
	canSortByScore,
}: CurrentSortArgs): CurrentSort {
	if (isSortType(paramSort) && (canSortByScore || !isScoreOrderedSort(paramSort))) {
		return { kind: 'sort', sort: paramSort };
	}
	if (hasManualOrder) return { kind: 'manual' };

	return { kind: 'sort', sort: guardScoreSort(defaultSort ?? SortType.newest, canSortByScore) };
}

/** Back to the question's default view: the Rate view on a large question. */
export function buildRateViewPath(
	pathname: string,
	statementId: string,
	tab: string | null,
): string {
	const query = tab ? `?tab=${encodeURIComponent(tab)}` : '';

	return `/${sortRouteBase(pathname)}/${statementId}${query}`;
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
