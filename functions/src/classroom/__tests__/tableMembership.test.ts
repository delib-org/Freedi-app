import type { ClassTable } from '@freedi/shared-types';
import { addMember, removeMember } from '../tableMembership';

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: 'a',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: ['a'],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

describe('removeMember', () => {
	it('passes the asker role to the next tablemate when the asker leaves', () => {
		const next = removeMember(table(), 'a', NOW);
		expect(next).toMatchObject({
			memberUids: ['b', 'c'],
			askerUid: 'b',
			spokenUids: [],
			updatedAt: NOW,
		});
	});

	it('wraps to the first member when the last-seated asker leaves', () => {
		expect(removeMember(table({ askerUid: 'c' }), 'c', NOW).askerUid).toBe('a');
	});

	it('leaves the asker alone when someone else leaves, and empties to null', () => {
		expect(removeMember(table(), 'b', NOW).askerUid).toBe('a');
		const last = removeMember(table({ memberUids: ['a'] }), 'a', NOW);
		expect(last).toMatchObject({ memberUids: [], askerUid: null });
	});

	it('takes the floor away from a speaker who leaves', () => {
		const next = removeMember(table({ speakerUid: 'b', speakerEndsAt: NOW + 10 }), 'b', NOW);
		expect(next.speakerUid).toBeUndefined();
		expect(next.speakerEndsAt).toBeUndefined();
	});

	it('is a no-op for someone not at the table', () => {
		const t = table();
		expect(removeMember(t, 'zz', NOW)).toBe(t);
	});
});

describe('addMember', () => {
	it('seats a student last and keeps the asker', () => {
		expect(addMember(table(), 'd', NOW)).toMatchObject({
			memberUids: ['a', 'b', 'c', 'd'],
			askerUid: 'a',
		});
	});

	it('makes the newcomer asker of an askerless table', () => {
		expect(addMember(table({ memberUids: [], askerUid: null }), 'd', NOW).askerUid).toBe('d');
	});

	it('does not seat someone twice', () => {
		const t = table();
		expect(addMember(t, 'a', NOW)).toBe(t);
	});
});
