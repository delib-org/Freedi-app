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

export function getTotalVoters(statement: Statement | undefined) {
	try {
		if (!statement) return 0;
		const { selections } = statement;

		if (selections) {
			let totalVoters = 0;
			Object.keys(statement.selections).forEach((key: string) => {
				if (key !== 'none') {
					totalVoters += statement.selections[key];
				}
			});

			return totalVoters;
		}

		return 0;
	} catch (error) {
		logError(error, { operation: 'vote.statementVoteCont.getTotalVoters' });

		return 0;
	}
}

// TODO: Not used. Delete later
export function getSelections(statement: Statement, option: Statement) {
	try {
		if (statement.selections?.[option.statementId] !== undefined) {
			const optionSelections = statement.selections[option.statementId];
			if (!optionSelections) return 0;

			return optionSelections;
		}

		return 0;
	} catch (error) {
		logError(error, { operation: 'vote.statementVoteCont.getSelections' });

		return 0;
	}
}

// Re-export from canonical location
export {
	getSiblingOptionsByParentId,
	getExistingOptionColors,
} from '@/controllers/utils/colorUtils';
