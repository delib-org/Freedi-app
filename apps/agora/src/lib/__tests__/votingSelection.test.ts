import { describe, it, expect } from 'vitest';
import {
	AGORA_VOTING,
	CutoffBy,
	NO_VOTE,
	ResultsBy,
	pickVoteWinner,
	resolveVotingSelection,
	tallyVotes,
} from '@freedi/shared-types';

/**
 * The election's arithmetic. It lives in shared-types because the server counts
 * the votes and the screens explain the count — a class that is told one winner
 * and shown another has learned the wrong lesson about voting.
 */
describe('resolveVotingSelection', () => {
	it('defaults to the top few by consensus when the teacher set nothing', () => {
		expect(resolveVotingSelection(undefined)).toEqual({
			resultsBy: ResultsBy.consensus,
			cutoffBy: CutoffBy.topOptions,
			numberOfResults: AGORA_VOTING.DEFAULT_TOP_X,
			cutoffNumber: AGORA_VOTING.DEFAULT_CUTOFF_CP,
		});
	});

	it('keeps a top-N choice', () => {
		const settings = {
			selection: {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.topOptions,
				numberOfResults: 2,
			},
		};

		expect(resolveVotingSelection(settings)).toMatchObject({
			cutoffBy: CutoffBy.topOptions,
			numberOfResults: 2,
		});
	});

	it('keeps an everyone-on-the-ballot choice', () => {
		const settings = {
			selection: { resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.all },
		};

		expect(resolveVotingSelection(settings)).toMatchObject({ cutoffBy: CutoffBy.all });
	});

	it('keeps a threshold choice', () => {
		const settings = {
			selection: {
				resultsBy: ResultsBy.consensus,
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: 0.4,
			},
		};

		expect(resolveVotingSelection(settings)).toMatchObject({
			cutoffBy: CutoffBy.aboveThreshold,
			cutoffNumber: 0.4,
		});
	});
});

describe('tallyVotes', () => {
	const ballot = ['a', 'b'];

	it('counts one vote per option', () => {
		const counts = tallyVotes(
			[
				{ statementId: 'a', userId: 'u1' },
				{ statementId: 'a', userId: 'u2' },
				{ statementId: 'b', userId: 'u3' },
			],
			ballot,
		);

		expect(counts).toEqual({ a: 2, b: 1 });
	});

	// A withdrawal is stored as a vote doc, not a deletion — counting the
	// sentinel would invent an option nobody stood for.
	it('ignores withdrawn votes', () => {
		const counts = tallyVotes(
			[
				{ statementId: NO_VOTE, userId: 'u1' },
				{ statementId: 'a', userId: 'u2' },
			],
			ballot,
		);

		expect(counts).toEqual({ a: 1 });
		expect(counts[NO_VOTE]).toBeUndefined();
	});

	it('ignores votes for proposals that never reached the ballot', () => {
		expect(tallyVotes([{ statementId: 'c', userId: 'u1' }], ballot)).toEqual({});
	});

	it('counts a voter once even if handed duplicate docs', () => {
		const counts = tallyVotes(
			[
				{ statementId: 'a', userId: 'u1' },
				{ statementId: 'b', userId: 'u1' },
			],
			ballot,
		);

		expect(counts).toEqual({ a: 1 });
	});

	it('returns nothing when nobody voted', () => {
		expect(tallyVotes([], ballot)).toEqual({});
	});
});

describe('pickVoteWinner', () => {
	it('elects the most-voted proposal', () => {
		const winner = pickVoteWinner({ a: 3, b: 1 }, { a: 0.4, b: 0.9 });

		expect(winner).toEqual({ winnerStatementId: 'a', metThreshold: true, total: 4 });
	});

	// Ties are broken the same way by every reader — otherwise the projector
	// and the phones could crown different proposals from identical data.
	it('breaks a tie on consensus', () => {
		expect(pickVoteWinner({ a: 2, b: 2 }, { a: 0.3, b: 0.7 }).winnerStatementId).toBe('b');
	});

	it('breaks a tie on statementId when consensus also ties', () => {
		expect(pickVoteWinner({ b: 2, a: 2 }, { a: 0.5, b: 0.5 }).winnerStatementId).toBe('a');
	});

	it('reports no winner when nobody voted', () => {
		expect(pickVoteWinner({}, {})).toEqual({ metThreshold: false, total: 0 });
	});

	it('clears a win threshold the winner meets', () => {
		const winner = pickVoteWinner({ a: 5 }, { a: 0.9 }, 0.88);

		expect(winner.winnerStatementId).toBe('a');
		expect(winner.metThreshold).toBe(true);
	});

	// Still named — the class chose it, and the results screen has to say what
	// happened — but it does not take the crown.
	it('names but does not crown a winner below the threshold', () => {
		const winner = pickVoteWinner({ a: 5 }, { a: 0.5 }, 0.88);

		expect(winner.winnerStatementId).toBe('a');
		expect(winner.metThreshold).toBe(false);
	});

	it('treats an unset threshold as no bar at all', () => {
		expect(pickVoteWinner({ a: 1 }, { a: -0.9 }).metThreshold).toBe(true);
	});
});
