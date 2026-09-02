import {
	VOTE_AGAINST,
	NO_VOTE,
	ballotTallyIds,
	isVoteSentinel,
	pickVoteWinner,
	tallyVotes,
} from '../models/vote/votingStageSettings';

describe('the one-candidate ballot', () => {
	it('carries the against side in its tally ids only when there is exactly one candidate', () => {
		expect(ballotTallyIds(['a'])).toEqual(['a', VOTE_AGAINST]);
		expect(ballotTallyIds(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('counts for and against like any candidate', () => {
		const counts = tallyVotes(
			[
				{ statementId: 'a', userId: 'u1' },
				{ statementId: VOTE_AGAINST, userId: 'u2' },
				{ statementId: VOTE_AGAINST, userId: 'u3' },
				{ statementId: NO_VOTE, userId: 'u4' },
			],
			ballotTallyIds(['a']),
		);

		expect(counts).toEqual({ a: 1, [VOTE_AGAINST]: 2 });
	});

	it('adopts the proposal only on a strict majority, and never names against as the winner', () => {
		expect(pickVoteWinner({ a: 2, [VOTE_AGAINST]: 1 }, { a: 0.9 })).toEqual({
			winnerStatementId: 'a',
			metThreshold: true,
			total: 3,
			rejected: false,
		});
		expect(pickVoteWinner({ a: 1, [VOTE_AGAINST]: 1 }, { a: 0.9 })).toEqual({
			metThreshold: false,
			total: 2,
			rejected: true,
		});
		expect(pickVoteWinner({ [VOTE_AGAINST]: 3 }, {})).toEqual({
			metThreshold: false,
			total: 3,
			rejected: true,
		});
	});

	it('still applies the win threshold to an adopted proposal', () => {
		expect(pickVoteWinner({ a: 3, [VOTE_AGAINST]: 1 }, { a: 0.2 }, 0.5).metThreshold).toBe(false);
	});

	it('leaves the multi-candidate election exactly as it was', () => {
		expect(pickVoteWinner({ a: 2, b: 2 }, { a: 0.1, b: 0.4 })).toEqual({
			winnerStatementId: 'b',
			metThreshold: true,
			total: 4,
		});
	});

	it('knows which ids are sentinels', () => {
		expect(isVoteSentinel(NO_VOTE)).toBe(true);
		expect(isVoteSentinel(VOTE_AGAINST)).toBe(true);
		expect(isVoteSentinel('abc')).toBe(false);
	});
});
