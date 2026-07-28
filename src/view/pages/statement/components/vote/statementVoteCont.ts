import { SortType, Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

// Updates the displayed options with how many votes each option has from the parent statement
export function setSelectionsToOptions(statement: Statement, options: Statement[]) {
	try {
		const parsedOptions = JSON.parse(JSON.stringify(options));
		if (statement.selections) {
			parsedOptions.forEach((option: Statement) => {
				if (statement.selections?.[option.statementId] !== undefined) {
					const optionSelections = statement.selections[option.statementId];
					option.voted = optionSelections;
				}
			});
		}

		return parsedOptions;
	} catch (error) {
		logError(error, { operation: 'vote.statementVoteCont.setSelectionsToOptions' });

		return options;
	}
}

export function sortOptionsIndex(options: Statement[], sort: string | undefined): Statement[] {
	let _options = JSON.parse(JSON.stringify(options));

	// sort only the order of the options according to the sort
	switch (sort) {
		case SortType.newest:
			_options = _options.sort((a: Statement, b: Statement) => {
				return b.createdAt - a.createdAt;
			});
			break;
		case SortType.random:
			_options = _options.sort(() => Math.random() - 0.5);
			break;
		case SortType.accepted:
			_options = _options.sort((a: Statement, b: Statement) => {
				const aVoted: number = a.voted ?? 0;
				const bVoted: number = b.voted ?? 0;

				return bVoted - aVoted;
			});
			break;
		default:
			break;
	}
	_options = _options.map((option: Statement, i: number) => {
		option.order = i;

		return option;
	});
	_options = _options.sort((a: Statement, b: Statement) => {
		return b.createdAt - a.createdAt;
	});

	return _options;
}

// Tallies and per-option counts now come from `useOptimisticVotes`, which reads
// the same `statement.selections` but can also adjust for an unconfirmed vote.

// Re-export from canonical location
export {
	getSiblingOptionsByParentId,
	getExistingOptionColors,
} from '@/controllers/utils/colorUtils';
