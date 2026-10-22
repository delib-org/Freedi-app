import type { ClassTable } from '@freedi/shared-types';
import { notAskedUids } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { addMember, removeMember } from '../tableMembership';
import { applyTableAction } from '../tableTransitions';

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
	it('keeps the leaver in askedUids, and the asker role skips tablemates who asked', () => {
		const next = removeMember(table({ askedUids: ['a', 'b'], askerUid: 'a' }), 'a', NOW);
		expect(next.askedUids).toEqual(['a', 'b']);
		expect(next.askerUid).toBe('c');
	});

	it('a student who asked, left and was seated again cannot claim another turn', () => {
		const rate = table({ step: 'rate', askerUid: 'b', askedUids: ['a'] });
		const back = addMember(removeMember(rate, 'a', NOW), 'a', NOW);
		expect(notAskedUids(back)).toEqual(['c']);
		try {
			applyTableAction(back, { action: 'nextTurn' }, { actorUid: 'a', isAdmin: false, now: NOW });
			throw new Error('expected a refusal');
		} catch (error) {
			expect((error as ClassroomError).reason).toBe('already-asked');
		}
	});

	it('skips tablemates who already asked when the asker leaves', () => {
		const next = removeMember(table({ askedUids: ['b'], askerUid: 'a' }), 'a', NOW);
		expect(next.askerUid).toBe('c');
		expect(next.askedUids).toEqual(['b']);
	});

	it('falls back to the next seated when everyone left has asked', () => {
		const next = removeMember(table({ askedUids: ['b', 'c'], askerUid: 'a' }), 'a', NOW);
		expect(next.askerUid).toBe('b');
	});

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
