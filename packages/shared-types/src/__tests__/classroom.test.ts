import {
	askerMayAnswer,
	campOf,
	choosing,
	classTableId,
	decideBallot,
	everyoneSpoke,
	floorOpen,
	notAskedUids,
	othersAnswered,
	speakerTimeOver,
	supportBySide,
	tableDone,
} from '../index';

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

describe('notAskedUids with passes', () => {
	it('leaves out members who passed on asking', () => {
		expect(
			notAskedUids({
				memberUids: ['a', 'b', 'c', 'd'],
				askerUid: null,
				askedUids: ['a'],
				passedAskingUids: ['c'],
			}),
		).toEqual(['b', 'd']);
	});
});

describe('speakerTimeOver / everyoneSpoke', () => {
	const base = { memberUids: ['a', 'b'], spokenUids: ['a'] };

	it('counts the speaker only once their minute is over', () => {
		const running = { ...base, speakerUid: 'b', speakerEndsAt: 2000 };
		expect(everyoneSpoke(running, 1000)).toBe(false);
		expect(everyoneSpoke(running, 2000)).toBe(true);
		expect(speakerTimeOver(running, 1999)).toBe(false);
		expect(speakerTimeOver(running, 2000)).toBe(true);
		expect(speakerTimeOver({}, 0)).toBe(true);
	});

	it('is false for an empty table', () => {
		expect(everyoneSpoke({ memberUids: [], spokenUids: [] }, 0)).toBe(false);
	});
});

describe('tableDone', () => {
	const spokeAll = { spokenUids: ['a', 'b'] };

	it('is done when everyone asked or passed and nobody is asking', () => {
		expect(
			tableDone(
				{
					memberUids: ['a', 'b'],
					askerUid: null,
					askedUids: ['a'],
					passedAskingUids: ['b'],
					spokenUids: [],
				},
				0,
			),
		).toBe(true);
	});

	it('waits for the current talk to be over', () => {
		const table = {
			memberUids: ['a', 'b'],
			askerUid: 'b',
			askedUids: ['a', 'b'],
			spokenUids: ['a'],
		};
		expect(tableDone(table, 0)).toBe(false);
		expect(tableDone({ ...table, ...spokeAll }, 0)).toBe(true);
	});

	it('is not done while somebody can still ask', () => {
		expect(
			tableDone({ memberUids: ['a', 'b'], askerUid: 'a', askedUids: ['a'], ...spokeAll }, 0),
		).toBe(false);
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

describe('table turn v3 derived states', () => {
	const NOW = 1_000_000;
	const base = {
		step: 'talk' as const,
		memberUids: ['a', 'b', 'c'],
		askerUid: 'a',
		askedUids: ['a'],
		spokenUids: [] as string[],
	};

	it('floorOpen: nobody holds a running minute', () => {
		expect(floorOpen({}, NOW)).toBe(true);
		expect(floorOpen({ speakerEndsAt: NOW + 1 }, NOW)).toBe(false);
		expect(floorOpen({ speakerEndsAt: NOW }, NOW)).toBe(true);
	});

	it('othersAnswered ignores the asker and passes, and counts a minute that ran out', () => {
		expect(othersAnswered({ ...base, spokenUids: ['a'] }, NOW)).toBe(false);
		expect(othersAnswered({ ...base, spokenUids: ['b'], passedSpeakingUids: ['b'] }, NOW)).toBe(
			false,
		);
		expect(othersAnswered({ ...base, speakerUid: 'b', speakerEndsAt: NOW - 1 }, NOW)).toBe(true);
		expect(othersAnswered({ ...base, speakerUid: 'b', speakerEndsAt: NOW + 1 }, NOW)).toBe(false);
	});

	it('askerMayAnswer: one other answered, or every other tablemate answered or passed', () => {
		expect(askerMayAnswer(base, NOW)).toBe(false);
		expect(askerMayAnswer({ ...base, spokenUids: ['c'] }, NOW)).toBe(true);
		expect(
			askerMayAnswer(
				{ ...base, spokenUids: ['b', 'c'], passedSpeakingUids: ['b', 'c'] },
				NOW,
			),
		).toBe(true);
	});

	it('choosing: at pick, or at talk once everyone spoke; never once the table is done', () => {
		expect(choosing({ ...base, step: 'pick', askerUid: null, askedUids: [] }, NOW)).toBe(true);
		expect(choosing(base, NOW)).toBe(false);
		const over = { ...base, spokenUids: ['a', 'b', 'c'] };
		expect(choosing(over, NOW)).toBe(true);
		expect(choosing({ ...over, askedUids: ['a', 'b'], passedAskingUids: ['c'] }, NOW)).toBe(false);
	});
});
