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
	it('keeps the leaver in askedUids and passedAskingUids; the asker leaving means nobody asks', () => {
		const next = removeMember(
			table({ askedUids: ['a', 'b'], passedAskingUids: ['c'], askerUid: 'a' }),
			'a',
			NOW,
		);
		expect(next.askedUids).toEqual(['a', 'b']);
		expect(next.passedAskingUids).toEqual(['c']);
		expect(next.askerUid).toBeNull();
	});

	it('a student who asked, left and was seated again cannot claim another turn', () => {
		const v2 = table({
			step: 'talk',
			askerUid: 'b',
			askedUids: ['a', 'b'],
			spokenUids: ['a', 'b', 'c'],
		});
		const back = addMember(removeMember(v2, 'a', NOW), 'a', NOW);
		expect(notAskedUids(back)).toEqual(['c']);
		try {
			applyTableAction(
				back,
				{ action: 'claimTurn', fromTurn: 1, questionId: 'q9' },
				{ actorUid: 'a', isAdmin: false, now: NOW, lessonStep: 'tableTalk' },
			);
			throw new Error('expected a refusal');
		} catch (error) {
			expect((error as ClassroomError).reason).toBe('already-asked');
		}
	});

	it('a student who passed, left and was seated again stays passed', () => {
		const t = table({ passedAskingUids: ['c'], askerUid: null, step: 'pick' });
		const back = addMember(removeMember(t, 'c', NOW), 'c', NOW);
		expect(notAskedUids(back)).toEqual(['a', 'b']);
	});

	it('at pick the leaving asker frees the question they chose (V1 again)', () => {
		const next = removeMember(
			table({ step: 'pick', askerUid: 'a', questionId: 'q1', usedQuestionIds: ['q0', 'q1'] }),
			'a',
			NOW,
		);
		expect(next.askerUid).toBeNull();
		expect(next.questionId).toBeUndefined();
		expect(next.usedQuestionIds).toEqual(['q0']);
	});

	it('at talk the turn continues askerless and the question stays', () => {
		const next = removeMember(table({ questionId: 'q1', usedQuestionIds: ['q1'] }), 'a', NOW);
		expect(next).toMatchObject({
			memberUids: ['b', 'c'],
			askerUid: null,
			questionId: 'q1',
			usedQuestionIds: ['q1'],
			spokenUids: [],
			updatedAt: NOW,
		});
	});

	it('removes the leaver from this turn passed minutes', () => {
		const next = removeMember(
			table({ spokenUids: ['a', 'b'], passedSpeakingUids: ['b'] }),
			'b',
			NOW,
		);
		expect(next.spokenUids).toEqual(['a']);
		expect(next.passedSpeakingUids).toEqual([]);
	});

	it('leaves the asker alone when someone else leaves, and empties to no asker', () => {
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

	it('does not make the newcomer asker of an askerless table', () => {
		expect(addMember(table({ memberUids: [], askerUid: null }), 'd', NOW).askerUid).toBeNull();
	});

	it('does not seat someone twice', () => {
		const t = table();
		expect(addMember(t, 'a', NOW)).toBe(t);
	});
});
