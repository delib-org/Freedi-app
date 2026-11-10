import { Statement } from '@freedi/shared-types';
import { filterVotingOptions, topVotingOptions } from '../votingOptionsFilter';

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

describe('topVotingOptions', () => {
	const option = (statementId: string, consensus: number, createdAt: number): Statement =>
		({ statementId, consensus, createdAt }) as Statement;
	const options = [
		option('lowest', -0.5, 1),
		option('second', 0.5, 2),
		option('top', 0.9, 3),
		option('third', 0.1, 4),
	];
	const ids = (list: Statement[]) => list.map((item) => item.statementId);

	it('keeps the score order while results can be shown', () => {
		expect(ids(topVotingOptions(options, 3, false))).toEqual(['top', 'second', 'third']);
	});

	it('keeps the same top answers but orders them oldest first while results are off', () => {
		expect(ids(topVotingOptions(options, 3, true))).toEqual(['second', 'top', 'third']);
	});

	it('leaves the array it was given untouched', () => {
		topVotingOptions(options, 3, false);

		expect(ids(options)).toEqual(['lowest', 'second', 'top', 'third']);
	});
});
