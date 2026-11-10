import { CutoffBy, ResultsSettings, SortType, Statement } from '@freedi/shared-types';
import { resolveResultsSelection } from '../components/questionScreen/resultsLogic';
import { RANKED_ANSWERS } from '@/constants/common';

/**
 * How an ordering gets its answers on a large question.
 *
 * - 'top-answers': the `(parentId, statementType, consensus DESC)` index gives
 *   the top of the list a page at a time.
 * - 'complete-set': no index ranks this ordering, so the only correct ranking is
 *   over every answer.
 * - 'window': the order the windowed list already loads in, or no order at all.
 */
export type RankingSource = 'top-answers' | 'complete-set' | 'window';

const COMPLETE_SET_SORTS: ReadonlySet<string> = new Set<string>([
	SortType.averageEvaluation,
	SortType.mostJoined,
	SortType.mostUpdated,
]);

export function rankingSourceForSort(
	sort: string | undefined,
	question: Statement | undefined,
): RankingSource {
	if (sort === SortType.accepted) {
		// Single-like questions rank by likes, not by the indexed consensus field.
		return question?.statementSettings?.evaluationType === 'single-like'
			? 'complete-set'
			: 'top-answers';
	}

	return sort !== undefined && COMPLETE_SET_SORTS.has(sort) ? 'complete-set' : 'window';
}

/**
 * A hand-placed order lists answers by its own ids, wherever they rank, so a
 * list under one cannot be cut to the top page.
 */
export function rankingSourceForList(
	sort: string | undefined,
	question: Statement | undefined,
	hasManualOrder: boolean,
): RankingSource {
	const source = rankingSourceForSort(sort, question);

	return hasManualOrder && source === 'top-answers' ? 'complete-set' : source;
}

/**
 * The Results tab needs every answer when its rule is "all rated" or a
 * threshold: a page of top answers cannot say how many pass. Top N is enough
 * while N fits in the first page.
 */
export function resultsNeedCompleteSet(
	settings: ResultsSettings | undefined,
	question: Statement | undefined,
): boolean {
	if (rankingSourceForSort(SortType.accepted, question) === 'complete-set') return true;
	const { cutoffBy, numberOfResults } = resolveResultsSelection(settings);
	if (cutoffBy === CutoffBy.all || cutoffBy === CutoffBy.aboveThreshold) return true;

	return numberOfResults > RANKED_ANSWERS.PAGE_SIZE;
}
