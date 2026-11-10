import { Statement } from '@freedi/shared-types';
import { resolveCardMarks } from '../cardMarks';

const answer = { statementId: 'a1' } as Statement;

const parent = {
	statementId: 'q1',
	topVotedOption: { statementId: 'a1' },
	results: [{ statementId: 'a1' }],
} as unknown as Statement;

describe('resolveCardMarks', () => {
	it('shows both marks to a viewer the guard allows', () => {
		expect(resolveCardMarks(answer, parent, true)).toEqual({
			showVotingWinner: true,
			showInResults: true,
		});
	});

	it('shows neither mark to a viewer who has not rated', () => {
		expect(resolveCardMarks(answer, parent, false)).toEqual({
			showVotingWinner: false,
			showInResults: false,
		});
	});

	it('marks only the answer the parent names', () => {
		expect(resolveCardMarks({ statementId: 'other' } as Statement, parent, true)).toEqual({
			showVotingWinner: false,
			showInResults: false,
		});
	});

	it('marks nothing while the parent has not loaded', () => {
		expect(resolveCardMarks(answer, undefined, true)).toEqual({
			showVotingWinner: false,
			showInResults: false,
		});
	});
});
