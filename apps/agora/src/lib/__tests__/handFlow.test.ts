import { describe, expect, it } from 'vitest';
import {
	coverage,
	dealableCount,
	fillFingerprint,
	handStatus,
	shouldRequestFill,
	visibleNotes,
} from '../flows/handFlow';

const note = (statementId: string, creatorId = `author-${statementId}`, raters?: number) => ({
	statementId,
	creatorId,
	...(raters !== undefined ? { evaluation: { numberOfEvaluators: raters } } : {}),
});

const notes = [note('a'), note('b'), note('mine', 'me'), note('c'), note('d'), note('e')];
const none = new Set<string>();

describe('visibleNotes', () => {
	it('shows everything when the lottery is off or the station has closed', () => {
		const off = visibleNotes({
			notes,
			userId: 'me',
			hand: ['a'],
			rated: none,
			active: false,
			live: true,
		});
		expect(off).toEqual(notes);
		const closed = visibleNotes({
			notes,
			userId: 'me',
			hand: ['a'],
			rated: none,
			active: true,
			live: false,
		});
		expect(closed).toEqual(notes);
	});

	it('shows mine, the hand in deal order, and nothing else', () => {
		const shown = visibleNotes({
			notes,
			userId: 'me',
			hand: ['d', 'a'],
			rated: none,
			active: true,
			live: true,
		});
		expect(shown.map((n) => n.statementId)).toEqual(['mine', 'd', 'a']);
	});

	it('keeps a note I rated before the lottery switched on', () => {
		const shown = visibleNotes({
			notes,
			userId: 'me',
			hand: ['c'],
			rated: new Set(['e']),
			active: true,
			live: true,
		});
		expect(shown.map((n) => n.statementId)).toEqual(['mine', 'e', 'c']);
	});

	it('drops a dealt id whose note is gone and never reorders the rest', () => {
		const shown = visibleNotes({
			notes,
			userId: 'me',
			hand: ['b', 'gone', 'a'],
			rated: none,
			active: true,
			live: true,
		});
		expect(shown.map((n) => n.statementId)).toEqual(['mine', 'b', 'a']);
	});
});

describe('handStatus', () => {
	it('counts the rated part of the hand and knows when it is through', () => {
		expect(handStatus(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual({
			ratedCount: 2,
			total: 3,
			finished: false,
		});
		expect(handStatus(['a', 'b'], new Set(['a', 'b', 'z']))).toEqual({
			ratedCount: 2,
			total: 2,
			finished: true,
		});
		expect(handStatus([], none).finished).toBe(false);
	});
});

describe('shouldRequestFill', () => {
	const base = { active: true, live: true, hasMine: true, rated: none, dealable: 3 };

	it('asks while the hand is short', () => {
		expect(shouldRequestFill({ ...base, hand: [] })).toBe(true);
		expect(shouldRequestFill({ ...base, hand: ['a', 'b'] })).toBe(true);
	});

	it('asks again only once a full hand is rated through', () => {
		const hand = ['a', 'b', 'c', 'd', 'e'];
		expect(shouldRequestFill({ ...base, hand, rated: new Set(['a']) })).toBe(false);
		expect(shouldRequestFill({ ...base, hand, rated: new Set(hand) })).toBe(true);
	});

	it('never asks before I wrote, after the station closed, with nothing to deal, or when off', () => {
		expect(shouldRequestFill({ ...base, hand: [], hasMine: false })).toBe(false);
		expect(shouldRequestFill({ ...base, hand: [], live: false })).toBe(false);
		expect(shouldRequestFill({ ...base, hand: [], dealable: 0 })).toBe(false);
		expect(shouldRequestFill({ ...base, hand: [], active: false })).toBe(false);
	});
});

describe('fillFingerprint / dealableCount', () => {
	it('changes when the hand, my ratings or the pool change', () => {
		const a = fillFingerprint({ hand: ['a'], rated: none, dealable: 2 });
		expect(fillFingerprint({ hand: ['a'], rated: none, dealable: 2 })).toBe(a);
		expect(fillFingerprint({ hand: ['a', 'b'], rated: none, dealable: 2 })).not.toBe(a);
		expect(fillFingerprint({ hand: ['a'], rated: new Set(['a']), dealable: 2 })).not.toBe(a);
		expect(fillFingerprint({ hand: ['a'], rated: none, dealable: 3 })).not.toBe(a);
	});

	it('counts classmates’ notes outside my hand and my ratings', () => {
		expect(dealableCount(notes, 'me', ['a'], new Set(['b']))).toBe(3);
	});
});

describe('coverage', () => {
	it('counts notes with enough raters', () => {
		const rows = [note('a', 'x', 6), note('b', 'y', 2), note('c', 'z'), note('d', 'w', 9)];
		expect(coverage(rows)).toEqual({ covered: 2, total: 4 });
		expect(coverage(rows, 2)).toEqual({ covered: 3, total: 4 });
	});
});
