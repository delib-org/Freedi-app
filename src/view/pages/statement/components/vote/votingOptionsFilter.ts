import { Statement, VotingOptionsSource } from '@freedi/shared-types';
import { sortByConsensus } from '@/redux/utils/selectorFactories';

/**
 * Narrows the options listed in the voting view.
 * 'positivelyEvaluated' keeps the options the group scored positively in the
 * card-stack evaluation (aggregate consensus above zero).
 */
export function filterVotingOptions(
	options: Statement[],
	source: VotingOptionsSource | undefined,
): Statement[] {
	if (source !== 'positivelyEvaluated') return options;

	return options.filter((option) => (option.consensus ?? 0) > 0);
}

/**
 * The ballot when only the top answers go to a vote. Which answers made it is
 * the host's configuration; the order among them is a ranking, so with
 * `neutralOrder` (results off) they read oldest first instead.
 */
export function topVotingOptions(
	options: readonly Statement[],
	count: number,
	neutralOrder: boolean,
): Statement[] {
	const top = [...options].sort(sortByConsensus).slice(0, count);

	return neutralOrder ? top.sort((a, b) => a.createdAt - b.createdAt) : top;
}
