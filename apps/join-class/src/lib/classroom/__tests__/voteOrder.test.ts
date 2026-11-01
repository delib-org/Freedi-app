import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	consensusOf,
	countsOf,
	keepOrder,
	orderBallot,
	seededShuffle,
	voteOrderOf,
	voteResults,
} from '../voteResults';

function challenge(voteDisplay?: {
	liveResults?: boolean;
	sortBySupport?: boolean;
	order?: 'consensus' | 'votes' | 'random';
}): Statement {
	return {
		statementId: 'ch',
		statementSettings: voteDisplay ? { voteDisplay } : {},
	} as unknown as Statement;
}

describe('voteOrderOf', () => {
	it('is consensus by default, for old docs (sortBySupport is not read) and for junk', () => {
		expect(voteOrderOf(null)).toBe('consensus');
		expect(voteOrderOf(challenge())).toBe('consensus');
		expect(voteOrderOf(challenge({ sortBySupport: true }))).toBe('consensus');
		expect(voteOrderOf(challenge({ order: 'sideways' as unknown as 'votes' }))).toBe('consensus');
	});

	it('reads the three modes', () => {
		expect(voteOrderOf(challenge({ order: 'consensus' }))).toBe('consensus');
		expect(voteOrderOf(challenge({ order: 'votes' }))).toBe('votes');
		expect(voteOrderOf(challenge({ order: 'random' }))).toBe('random');
	});
});

describe('seededShuffle', () => {
	const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

	it('is the same for the same seed, whatever order the ids arrive in', () => {
		const one = seededShuffle(ids, 'challenge-1');
		expect(seededShuffle([...ids].reverse(), 'challenge-1')).toEqual(one);
		expect([...one].sort()).toEqual(ids);
	});

	it('differs between seeds and does not mutate its input', () => {
		const copy = [...ids];
		expect(seededShuffle(ids, 'challenge-1')).not.toEqual(seededShuffle(ids, 'challenge-2'));
		expect(ids).toEqual(copy);
	});

	it('handles empty and single ballots', () => {
		expect(seededShuffle([], 's')).toEqual([]);
		expect(seededShuffle(['x'], 's')).toEqual(['x']);
	});
});

describe('keepOrder', () => {
	it('drops ids that left the ballot and appends new ones by id', () => {
		expect(keepOrder(['d', 'c', 'b', 'a'], ['x', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd']);
	});
});

describe('orderBallot', () => {
	const ballot = ['a', 'b', 'c', 'd'];
	const none = { consensus: {}, votes: {} };

	it('consensus: highest C_p first, missing last, ties keep the order on screen', () => {
		const scores = { consensus: { a: 0.2, b: 0.9, c: 0.2 }, votes: {} };
		expect(orderBallot(ballot, 'consensus', scores, [], 's')).toEqual(['b', 'a', 'c', 'd']);
		expect(orderBallot(ballot, 'consensus', scores, ['c', 'a', 'b', 'd'], 's')).toEqual([
			'b',
			'c',
			'a',
			'd',
		]);
	});

	it('votes: most votes first; equal counts never move a card', () => {
		const shown = ['c', 'b', 'a', 'd'];
		const tied = { consensus: {}, votes: { a: 2, b: 2, c: 2 } };
		expect(orderBallot(ballot, 'votes', tied, shown, 's')).toEqual(shown);
		const ahead = { consensus: {}, votes: { a: 3, b: 2, c: 2 } };
		expect(orderBallot(ballot, 'votes', ahead, shown, 's')).toEqual(['a', 'c', 'b', 'd']);
		expect(orderBallot(ballot, 'votes', none, [], 's')).toEqual(ballot);
	});

	it('random: one shared order, unaffected by votes, C_p or what was shown', () => {
		const one = orderBallot(ballot, 'random', none, [], 'ch');
		const two = orderBallot(
			ballot,
			'random',
			{ consensus: { a: 1 }, votes: { d: 9 } },
			['d', 'c', 'b', 'a'],
			'ch',
		);
		expect(two).toEqual(one);
	});

	it('result: votes, then C_p, then id (the decideBallot rule), winner first', () => {
		const scores = { consensus: { a: 0.1, b: 0.5, c: 0.5 }, votes: { a: 3, b: 3, c: 3, d: 1 } };
		expect(orderBallot(ballot, 'result', scores, ['d', 'c', 'b', 'a'], 's')).toEqual([
			'b',
			'c',
			'a',
			'd',
		]);
	});
});

describe('countsOf and consensusOf', () => {
	it('flatten the results and the options', () => {
		expect(countsOf(voteResults(['a', 'b'], { a: 2 }))).toEqual({ a: 2, b: 0 });
		const options = [
			{ statementId: 'a', consensus: 0.4 },
			{ statementId: 'b' },
			{ statementId: 'c', consensus: Number.NaN },
		] as unknown as Statement[];
		expect(consensusOf(options)).toEqual({ a: 0.4 });
	});
});
