import { Statement, VotingOptionsSource } from '@freedi/shared-types';

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
