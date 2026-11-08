import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { moveOnView } from '../moveOn';

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c', 'd'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

describe('moveOnView', () => {
	it('starts at 0 of 2 for a 4-table', () => {
		expect(moveOnView(table(), 'a')).toEqual({ count: 0, needed: 2, pressed: false });
	});

	it('counts the presses and knows mine', () => {
		const t = table({ moveOnUids: ['b'] });
		expect(moveOnView(t, 'b')).toEqual({ count: 1, needed: 2, pressed: true });
		expect(moveOnView(t, 'c').pressed).toBe(false);
	});

	it('a table of two needs both, a table of one needs one', () => {
		expect(moveOnView(table({ memberUids: ['a', 'b'] }), 'a').needed).toBe(2);
		expect(moveOnView(table({ memberUids: ['a'] }), 'a').needed).toBe(1);
	});

	it('ignores presses of students who left', () => {
		expect(moveOnView(table({ moveOnUids: ['gone', 'b'] }), 'a').count).toBe(1);
	});
});
