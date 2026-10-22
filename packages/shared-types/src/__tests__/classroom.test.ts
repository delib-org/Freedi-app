import { campOf, classTableId, decideBallot, notAskedUids, supportBySide } from '../index';

describe('notAskedUids', () => {
	it('lists tablemates in seating order who have not asked and are not the asker', () => {
		expect(
			notAskedUids({ memberUids: ['a', 'b', 'c', 'd'], askerUid: 'b', askedUids: ['a'] }),
		).toEqual(['c', 'd']);
	});

	it('reads a missing askedUids as empty and is empty when everyone has asked', () => {
		expect(notAskedUids({ memberUids: ['a', 'b'], askerUid: 'a' })).toEqual(['b']);
		expect(notAskedUids({ memberUids: ['a', 'b'], askerUid: 'b', askedUids: ['a'] })).toEqual([]);
	});
});

describe('campOf', () => {
	it('uses thresholds 40 and 60, edges are centre', () => {
		expect(campOf(0)).toBe('a');
		expect(campOf(39.9)).toBe('a');
		expect(campOf(40)).toBe('center');
		expect(campOf(60)).toBe('center');
		expect(campOf(60.1)).toBe('b');
		expect(campOf(100)).toBe('b');
	});
});

describe('classTableId', () => {
	it('joins main id and number', () => {
		expect(classTableId('m1', 3)).toBe('m1--3');
	});
});

describe('supportBySide', () => {
	it('is insufficient when a pole camp has nobody who rated', () => {
		const r = supportBySide([{ camp: 'a', decisionSupport: 1 }, { camp: 'b' }], 0.6);
		expect(r.verdict).toBe('insufficient');
		expect(r.b).toEqual({ mean: 0, n: 0, m: 1 });
	});
	it('is closer when both poles are at or above the gate', () => {
		const r = supportBySide(
			[
				{ camp: 'a', decisionSupport: 0.5 },
				{ camp: 'a', decisionSupport: 1 },
				{ camp: 'b', decisionSupport: 1 },
				{ camp: 'center', decisionSupport: -1 },
			],
			0.6,
		);
		expect(r.a).toEqual({ mean: 0.75, n: 2, m: 2 });
		expect(r.center.mean).toBe(-1);
		expect(r.verdict).toBe('closer');
	});
	it('is closer exactly at the gate', () => {
		const r = supportBySide(
			[
				{ camp: 'a', decisionSupport: 0.5 },
				{ camp: 'b', decisionSupport: 0.5 },
			],
			0.5,
		);
		expect(r.verdict).toBe('closer');
	});
	it('is apart just below the gate on one side', () => {
		const r = supportBySide(
			[
				{ camp: 'a', decisionSupport: 0.49 },
				{ camp: 'b', decisionSupport: 1 },
			],
			0.5,
		);
		expect(r.verdict).toBe('apart');
	});
	it('ignores students without a camp', () => {
		const r = supportBySide([{ decisionSupport: 1 }], 0.6);
		expect(r.a.m + r.b.m + r.center.m).toBe(0);
	});
});

describe('decideBallot', () => {
	it('picks the most votes', () => {
		expect(decideBallot({ a: 1, b: 3 }, {})).toBe('b');
	});
	it('breaks a tie by consensus, then by lower id', () => {
		expect(decideBallot({ a: 2, b: 2 }, { a: 0.1, b: 0.5 })).toBe('b');
		expect(decideBallot({ b: 2, a: 2 }, { a: 0.5, b: 0.5 })).toBe('a');
		expect(decideBallot({ b: 2, a: 2 }, {})).toBe('a');
	});
	it('throws on an empty tally', () => {
		expect(() => decideBallot({}, {})).toThrow();
	});
});
