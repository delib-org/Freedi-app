import { describe, expect, it } from 'vitest';
import { ballotOrderKey, rankBallot } from '../ballotOrder';

const ballot = [{ statementId: 'a' }, { statementId: 'b' }, { statementId: 'c' }];

describe('rankBallot', () => {
	it('puts the most supported candidate on top', () => {
		const ranked = rankBallot(ballot, { a: 1, b: 3, c: 2 });

		expect(ranked.map((entry) => entry.candidate.statementId)).toEqual(['b', 'c', 'a']);
		expect(ranked.map((entry) => entry.votes)).toEqual([3, 2, 1]);
	});

	it('keeps every candidate its ballot number when it moves', () => {
		const ranked = rankBallot(ballot, { a: 0, b: 5 });

		expect(ranked.map((entry) => [entry.candidate.statementId, entry.number])).toEqual([
			['b', 2],
			['a', 1],
			['c', 3],
		]);
	});

	it('leaves ties in ballot order, so nothing shuffles before a vote lands', () => {
		expect(rankBallot(ballot, {}).map((entry) => entry.number)).toEqual([1, 2, 3]);
		expect(rankBallot(ballot, { a: 2, b: 2, c: 2 }).map((entry) => entry.number)).toEqual([
			1, 2, 3,
		]);
	});

	it('counts an unlisted candidate as zero votes', () => {
		expect(rankBallot(ballot, { c: 1 }).map((entry) => entry.votes)).toEqual([1, 0, 0]);
	});
});

describe('ballotOrderKey', () => {
	it('is the same string while the order holds and a different one when it changes', () => {
		const before = ballotOrderKey(rankBallot(ballot, { a: 1 }));
		const same = ballotOrderKey(rankBallot(ballot, { a: 4 }));
		const moved = ballotOrderKey(rankBallot(ballot, { a: 1, c: 2 }));

		expect(same).toBe(before);
		expect(moved).not.toBe(before);
	});
});
