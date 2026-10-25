import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import { liveResultsOn, voteResults } from '../voteResults';

function challenge(voteDisplay?: { liveResults?: boolean }): Statement {
	return {
		statementId: 'ch',
		statementSettings: voteDisplay ? { voteDisplay } : {},
	} as unknown as Statement;
}

describe('liveResultsOn', () => {
	it('is on by default and off only when the teacher switched it off', () => {
		expect(liveResultsOn(null)).toBe(true);
		expect(liveResultsOn(challenge())).toBe(true);
		expect(liveResultsOn(challenge({}))).toBe(true);
		expect(liveResultsOn(challenge({ liveResults: true }))).toBe(true);
		expect(liveResultsOn(challenge({ liveResults: false }))).toBe(false);
	});
});

describe('voteResults', () => {
	it('gives each candidate its votes and share of the ballot', () => {
		expect(voteResults(['a', 'b', 'c'], { a: 3, b: 1 })).toEqual({
			a: { count: 3, percent: 75 },
			b: { count: 1, percent: 25 },
			c: { count: 0, percent: 0 },
		});
	});

	it('ignores withdrawals, options off the ballot and junk counts', () => {
		const selections = { a: 2, none: 5, other: 9, b: -1, c: Number.NaN };
		expect(voteResults(['a', 'b', 'c'], selections)).toEqual({
			a: { count: 2, percent: 100 },
			b: { count: 0, percent: 0 },
			c: { count: 0, percent: 0 },
		});
	});

	it('shows 0% everywhere before the first vote', () => {
		expect(voteResults(['a', 'b'], undefined)).toEqual({
			a: { count: 0, percent: 0 },
			b: { count: 0, percent: 0 },
		});
		expect(voteResults([], { a: 1 })).toEqual({});
	});

	it('rounds shares to whole percents', () => {
		const results = voteResults(['a', 'b', 'c'], { a: 1, b: 1, c: 1 });
		expect(Object.values(results).map((r) => r.percent)).toEqual([33, 33, 33]);
	});
});
