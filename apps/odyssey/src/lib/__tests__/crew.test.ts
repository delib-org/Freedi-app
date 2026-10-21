import { describe, expect, it } from 'vitest';
import type { OdysseyElder } from '@freedi/shared-types';
import {
	CHIP_IN_TEXT_WEIGHT,
	CHIP_IN_VALUES_WEIGHT,
	CREW_MAX,
	CREW_MIN,
	crewIsComplete,
	crewIsFull,
	crewLimits,
	rankEldersByWinds,
	withDisplayElders,
} from '../crew';

function elder(elderId: string, labels: string[], sortOrder: number): OdysseyElder {
	return {
		elderId,
		name: elderId,
		role: '',
		portraitUrl: null,
		color: '#000',
		bio: '',
		needs: [],
		values: labels.map((label) => ({ valueId: label, label, description: '' })),
		positions: {},
		reactions: {},
		challenges: {},
		sortOrder,
		enabled: true,
	};
}

describe('crewLimits', () => {
	it('asks for two to five sailors from a full roster', () => {
		expect(crewLimits(12)).toEqual({ min: CREW_MIN, max: CREW_MAX });
		expect(CREW_MIN).toBe(2);
		expect(CREW_MAX).toBe(5);
	});

	it('never demands more sailors than the game authored', () => {
		expect(crewLimits(3)).toEqual({ min: 2, max: 3 });
		expect(crewLimits(1)).toEqual({ min: 1, max: 1 });
		expect(crewLimits(0)).toEqual({ min: 0, max: 0 });
	});
});

describe('crewIsComplete / crewIsFull', () => {
	it('is complete at the minimum, not before', () => {
		expect(crewIsComplete(1, 12)).toBe(false);
		expect(crewIsComplete(2, 12)).toBe(true);
		// A journey from before the limits, with three picks, is still a crew.
		expect(crewIsComplete(3, 12)).toBe(true);
	});

	it('a game with no sailors has no crew to complete', () => {
		expect(crewIsComplete(0, 0)).toBe(false);
	});

	it('is full at the maximum', () => {
		expect(crewIsFull(4, 12)).toBe(false);
		expect(crewIsFull(5, 12)).toBe(true);
		expect(crewIsFull(3, 3)).toBe(true);
	});
});

describe('rankEldersByWinds', () => {
	const roster = [
		elder('herzl', ['חזון', 'מדינה', 'עתיד'], 1),
		elder('jabotinsky', ['ריבונות', 'ביטחון', 'כבוד'], 2),
		elder('aloni', ['חירות', 'זכויות', 'ביקורת'], 3),
		elder('senesh', ['אומץ', 'הקרבה', 'תקווה'], 4),
	];

	it('keeps the organizer order when the player ranked nothing', () => {
		const ranked = rankEldersByWinds(roster, []);
		expect(ranked.map((entry) => entry.elder.elderId)).toEqual([
			'herzl',
			'jabotinsky',
			'aloni',
			'senesh',
		]);
		expect(ranked.every((entry) => !entry.matchesWinds)).toBe(true);
	});

	it('floats sailors whose values echo the ranked values, top rank first', () => {
		const ranked = rankEldersByWinds(roster, ['חירות', 'ביטחון']);
		expect(ranked.map((entry) => entry.elder.elderId)).toEqual([
			'aloni',
			'jabotinsky',
			'herzl',
			'senesh',
		]);
		expect(ranked.map((entry) => entry.matchesWinds)).toEqual([true, true, false, false]);
	});

	it('matches a value contained in a longer label, but not short fragments', () => {
		const ranked = rankEldersByWinds(roster, ['כבוד האדם', 'עתיד משותף']);
		expect(ranked.slice(0, 2).map((entry) => entry.elder.elderId)).toEqual(['jabotinsky', 'herzl']);
		// "אב" is inside "אומץ"? No — and even a real fragment this short must not count.
		expect(rankEldersByWinds(roster, ['אב']).every((entry) => !entry.matchesWinds)).toBe(true);
	});

	it('floats a sailor whose values or bio echo a wind chip, and names the chip', () => {
		const women = {
			...elder('henrietta', ['חינוך', 'שוויון האישה', 'חלוציות'], 5),
			bio: 'פתחה משק לימוד',
		};
		const bioOnly = { ...elder('ben', ['מדינה'], 6), bio: 'נאבק למען זכות הבחירה לנשים' };
		const ranked = rankEldersByWinds([...roster, bioOnly, women], [], ['נשים']);

		expect(ranked.slice(0, 2).map((entry) => entry.elder.elderId)).toEqual(['henrietta', 'ben']);
		expect(ranked[0].echoedChips).toEqual(['נשים']);
		expect(ranked[2].echoedChips).toEqual([]);
		expect(CHIP_IN_VALUES_WEIGHT).toBeGreaterThan(CHIP_IN_TEXT_WEIGHT);
	});

	it('adds chips to the value ranking instead of replacing it', () => {
		const ranked = rankEldersByWinds(
			[elder('a', ['חירות'], 1), { ...elder('b', ['מדינה'], 2), bio: 'דאג לנשים' }],
			['חירות'],
			['נשים'],
		);

		expect(ranked.map((entry) => entry.elder.elderId)).toEqual(['b', 'a']);
		expect(ranked.every((entry) => entry.matchesWinds)).toBe(true);
	});

	it('counts a repeated chip once and ignores chips nobody echoes', () => {
		const ranked = rankEldersByWinds(roster, [], ['נשים', 'נשים', ' ', 'מילואימניקים']);

		expect(ranked.every((entry) => !entry.matchesWinds && entry.echoedChips.length === 0)).toBe(
			true,
		);
	});

	it('offers every sailor — ordering never drops anyone', () => {
		expect(rankEldersByWinds(roster, ['ביטחון'])).toHaveLength(roster.length);
	});
});

describe('withDisplayElders', () => {
	it('swaps each ranked elder for its localized twin by id and keeps the order and flags', () => {
		const roster = rankEldersByWinds(
			[elder('a', ['חירות'], 1), elder('b', ['שוויון'], 2)],
			['שוויון'],
		);
		const display = [
			{ ...elder('a', ['Liberty'], 1), name: 'Elder A' },
			{ ...elder('b', ['Equality'], 2), name: 'Elder B' },
		];

		const shown = withDisplayElders(roster, display);

		expect(shown.map((entry) => entry.elder.name)).toEqual(['Elder B', 'Elder A']);
		expect(shown.map((entry) => entry.matchesWinds)).toEqual([true, false]);
	});

	it('keeps the ranked elder when no twin exists and the roster when nothing is displayed', () => {
		const roster = rankEldersByWinds([elder('a', [], 1)], []);

		expect(withDisplayElders(roster, [elder('zzz', [], 9)])[0].elder.elderId).toBe('a');
		expect(withDisplayElders(roster, [])).toBe(roster);
	});
});
