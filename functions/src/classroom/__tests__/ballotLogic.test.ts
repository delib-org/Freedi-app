import { DEFAULT_GATE } from '@freedi/shared-types';
import {
	decideFromTally,
	resolveGate,
	selectBallotCandidates,
	tallyCandidates,
} from '../ballotLogic';

describe('resolveGate', () => {
	it('prefers the challenge threshold, then the workspace one, then the default', () => {
		expect(
			resolveGate({ votingSettings: { threshold: 0.4 } }, { votingSettings: { threshold: 0.7 } }),
		).toBe(0.4);
		expect(resolveGate({}, { votingSettings: { threshold: 0.7 } })).toBe(0.7);
		expect(resolveGate({}, {})).toBe(DEFAULT_GATE);
		expect(resolveGate({ votingSettings: { threshold: 0 } })).toBe(0);
	});
});

describe('selectBallotCandidates', () => {
	const options = [
		{ statementId: 'p1', consensus: 0.72 },
		{ statementId: 'p2', consensus: 0.64 },
		{ statementId: 'p3', consensus: 0.48 },
		{ statementId: 'p4', consensus: 0.31 },
		{ statementId: 'p5', consensus: 0.9, hide: true },
	];

	it('takes every visible option at or above the gate when two or more pass', () => {
		expect(selectBallotCandidates(options, 0.6)).toEqual(['p1', 'p2']);
		expect(selectBallotCandidates(options, 0.48)).toEqual(['p1', 'p2', 'p3']);
	});

	it('falls back to the top N by consensus when fewer than two pass', () => {
		expect(selectBallotCandidates(options, 0.7)).toEqual(['p1', 'p2', 'p3']);
		expect(selectBallotCandidates(options, 0.95, 2)).toEqual(['p1', 'p2']);
	});

	it('never lists hidden options and clamps a silly topN', () => {
		expect(selectBallotCandidates(options, 0.95, 1)).toEqual(['p1']);
		expect(selectBallotCandidates(options, 0.95, 0.2)).toEqual(['p1']);
		expect(selectBallotCandidates(options, 0.95, 1000)).toEqual(['p1', 'p2', 'p3', 'p4']);
	});

	it('orders ties by id and treats a missing consensus as 0', () => {
		expect(
			selectBallotCandidates(
				[
					{ statementId: 'b', consensus: 0.5 },
					{ statementId: 'a', consensus: 0.5 },
					{ statementId: 'c' },
				],
				0.9,
			),
		).toEqual(['a', 'b', 'c']);
	});

	it('returns nothing when there are no proposals', () => {
		expect(selectBallotCandidates([], 0.6)).toEqual([]);
	});
});

describe('tallyCandidates + decideFromTally', () => {
	it('counts only candidates and drops sentinels and junk', () => {
		const tally = tallyCandidates(['p1', 'p2'], { p1: 3, p2: 5, none: 4, p9: 7 });
		expect(tally).toEqual({ p1: 3, p2: 5 });
		expect(tallyCandidates(['p1'], undefined)).toEqual({ p1: 0 });
		expect(tallyCandidates(['p1'], { p1: -2 })).toEqual({ p1: 0 });
	});

	it('decides by votes, then consensus, then id; null for an empty ballot', () => {
		expect(decideFromTally({ p1: 3, p2: 5 }, { p1: 0.9, p2: 0.1 })).toBe('p2');
		expect(decideFromTally({ p1: 0, p2: 0 }, { p1: 0.4, p2: 0.6 })).toBe('p2');
		expect(decideFromTally({ p2: 1, p1: 1 }, { p1: 0.5, p2: 0.5 })).toBe('p1');
		expect(decideFromTally({}, {})).toBeNull();
	});
});
