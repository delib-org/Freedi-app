import { Statement } from '@freedi/shared-types';
import { filterVotingOptions } from '../votingOptionsFilter';

function makeOption(statementId: string, consensus?: number): Statement {
	return { statementId, consensus } as Statement;
}

describe('filterVotingOptions', () => {
	const options = [
		makeOption('a', 0.4),
		makeOption('b', -0.2),
		makeOption('c', 0),
		makeOption('d'),
	];

	it('returns every option by default', () => {
		expect(filterVotingOptions(options, undefined)).toEqual(options);
	});

	it('returns every option for "all"', () => {
		expect(filterVotingOptions(options, 'all')).toEqual(options);
	});

	it('keeps only positively evaluated options', () => {
		const result = filterVotingOptions(options, 'positivelyEvaluated');

		expect(result.map((o) => o.statementId)).toEqual(['a']);
	});

	it('returns an empty list when nothing is positive', () => {
		expect(filterVotingOptions([makeOption('x', -1)], 'positivelyEvaluated')).toEqual([]);
	});
});
