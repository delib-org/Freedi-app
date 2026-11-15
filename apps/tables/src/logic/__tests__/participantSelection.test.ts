import { describe, expect, it } from 'vitest';
import type { TableAssignmentRosterEntry } from '@freedi/shared-types';
import {
	allSelected,
	inBatches,
	rosterMatching,
	selectedPeople,
	toggleAllShown,
	toggleSelected,
} from '@/logic/participants';

function person(uid: string, fullName: string, registeredAt: number): TableAssignmentRosterEntry {
	return {
		sessionId: 's1',
		uid,
		fullName,
		nameKey: fullName.toLowerCase(),
		registeredAt,
		hasPreferences: false,
	};
}

const PEOPLE = [
	person('a', 'Test One', 1),
	person('b', 'Dana Levi', 2),
	person('c', 'Test Two', 3),
];

describe('participant selection', () => {
	it('toggles one person on and off without changing the original set', () => {
		const empty = new Set<string>();
		const one = toggleSelected(empty, 'a');
		expect([...one]).toEqual(['a']);
		expect(empty.size).toBe(0);
		expect(toggleSelected(one, 'a').size).toBe(0);
	});

	it('selects only the people the search shows', () => {
		const shown = rosterMatching(PEOPLE, 'test');
		const selected = toggleAllShown(shown, new Set(['b']));
		expect([...selected].sort()).toEqual(['a', 'b', 'c']);
		expect(allSelected(shown, selected)).toBe(true);
	});

	it('unticks the shown people when all of them are ticked, and keeps the hidden ones', () => {
		const shown = rosterMatching(PEOPLE, 'test');
		const selected = toggleAllShown(shown, new Set(['a', 'b', 'c']));
		expect([...selected]).toEqual(['b']);
	});

	it('says no one is all selected in an empty list', () => {
		expect(allSelected([], new Set(['a']))).toBe(false);
	});

	it('drops people who are no longer registered', () => {
		const people = selectedPeople([PEOPLE[0], PEOPLE[2]], new Set(['a', 'b', 'c']));
		expect(people.map((p) => p.uid)).toEqual(['a', 'c']);
	});

	it('cuts a list into batches of at most the size', () => {
		expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(inBatches([], 2)).toEqual([]);
	});
});
