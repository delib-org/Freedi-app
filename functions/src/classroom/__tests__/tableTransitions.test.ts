import { SPEAK_SECONDS } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { applyTableAction, everyoneSpoke, TransitionContext } from '../tableTransitions';
import { ClassroomError } from '../classroomErrors';

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['ask', 'b', 'c'],
		noDeviceMembers: [],
		step: 'pick',
		askerUid: 'ask',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

const asker: TransitionContext = { actorUid: 'ask', isAdmin: false, now: NOW };
const atProposals: TransitionContext = { ...asker, lessonStep: 'proposals' };
const member: TransitionContext = { actorUid: 'b', isAdmin: false, now: NOW };
const admin: TransitionContext = { actorUid: 'teacher', isAdmin: true, now: NOW };
const stranger: TransitionContext = { actorUid: 'zz', isAdmin: false, now: NOW };

function expectRefusal(fn: () => unknown, code: string): void {
	try {
		fn();
	} catch (error) {
		expect(error).toBeInstanceOf(ClassroomError);
		expect((error as ClassroomError).code).toBe(code);

		return;
	}
	throw new Error('expected a refusal');
}

describe('applyTableAction — actors', () => {
	it('refuses someone who is not at the table and not an admin', () => {
		expectRefusal(
			() => applyTableAction(table(), { action: 'toTalk' }, stranger),
			'permission-denied',
		);
	});

	it("refuses a plain tablemate on the asker's controls", () => {
		for (const action of [
			{ action: 'pickQuestion', questionId: 'q1' },
			{ action: 'toTalk' },
			{ action: 'passAsker', uid: 'c' },
			{ action: 'setWritingMode', mode: 'table' },
		] as ClassTableAction[]) {
			expectRefusal(
				() => applyTableAction(table({ step: 'pick' }), action, member),
				'permission-denied',
			);
		}
	});

	it('lets a tablemate choose the next speaker only once the minute is over', () => {
		const running = table({ step: 'talk', speakerUid: 'ask', speakerEndsAt: NOW + 5000 });
		expectRefusal(
			() => applyTableAction(running, { action: 'nextSpeaker', uid: 'c' }, member),
			'permission-denied',
		);
		const over = table({ step: 'talk', speakerUid: 'ask', speakerEndsAt: NOW - 1 });
		const next = applyTableAction(over, { action: 'nextSpeaker', uid: 'c' }, member);
		expect(next.speakerUid).toBe('c');
	});

	it('does not let a tablemate start the first speaker (no speaker yet)', () => {
		expectRefusal(
			() => applyTableAction(table({ step: 'talk' }), { action: 'nextSpeaker', uid: 'b' }, member),
			'permission-denied',
		);
	});

	it('lets a tablemate leave talk for write once everyone has spoken', () => {
		const notYet = table({
			step: 'talk',
			spokenUids: ['ask'],
			speakerUid: 'b',
			speakerEndsAt: NOW - 1,
		});
		expectRefusal(
			() => applyTableAction(notYet, { action: 'toWrite' }, member),
			'permission-denied',
		);
		const all = table({
			step: 'talk',
			spokenUids: ['ask', 'b'],
			speakerUid: 'c',
			speakerEndsAt: NOW - 1,
		});
		expect(applyTableAction(all, { action: 'toWrite' }, member).step).toBe('write');
	});
});

describe('applyTableAction — a whole turn by the asker', () => {
	it('pick -> talk -> speakers -> write -> rate -> next turn', () => {
		let t = applyTableAction(table(), { action: 'pickQuestion', questionId: 'q1' }, asker);
		expect(t).toMatchObject({
			step: 'pick',
			questionId: 'q1',
			usedQuestionIds: ['q1'],
			updatedAt: NOW,
		});

		t = applyTableAction(t, { action: 'toTalk' }, asker);
		expect(t.step).toBe('talk');

		t = applyTableAction(t, { action: 'nextSpeaker', uid: 'b' }, atProposals);
		expect(t).toMatchObject({
			speakerUid: 'b',
			speakerEndsAt: NOW + SPEAK_SECONDS * 1000,
			spokenUids: [],
		});

		t = applyTableAction(
			t,
			{ action: 'nextSpeaker', uid: 'c' },
			{ ...atProposals, now: NOW + 1000 },
		);
		expect(t).toMatchObject({ speakerUid: 'c', spokenUids: ['b'] });

		t = applyTableAction(t, { action: 'setWritingMode', mode: 'table' }, asker);
		t = applyTableAction(t, { action: 'toWrite' }, asker);
		expect(t).toMatchObject({ step: 'write', writingMode: 'table', spokenUids: ['b', 'c'] });
		expect(t.speakerUid).toBeUndefined();
		expect(t.speakerEndsAt).toBeUndefined();

		t = applyTableAction(t, { action: 'toRate' }, asker);
		expect(t.step).toBe('rate');
	});

	it('never advances the step because a timer ended', () => {
		const t = table({ step: 'talk', speakerUid: 'b', speakerEndsAt: NOW - 60_000 });
		const next = applyTableAction(t, { action: 'nextSpeaker', uid: 'c' }, asker);
		expect(next.step).toBe('talk');
	});
});

describe('applyTableAction — preconditions', () => {
	it('allows actions only from their steps (asker)', () => {
		expectRefusal(
			() =>
				applyTableAction(
					table({ step: 'talk' }),
					{ action: 'pickQuestion', questionId: 'q' },
					asker,
				),
			'failed-precondition',
		);
		expectRefusal(
			() => applyTableAction(table({ step: 'pick' }), { action: 'nextSpeaker', uid: 'b' }, asker),
			'failed-precondition',
		);
		expectRefusal(
			() => applyTableAction(table({ step: 'pick' }), { action: 'toRate' }, asker),
			'failed-precondition',
		);
		expectRefusal(
			() => applyTableAction(table({ step: 'rate' }), { action: 'toTalk' }, asker),
			'failed-precondition',
		);
		expectRefusal(
			() =>
				applyTableAction(
					table({ step: 'rate' }),
					{ action: 'setWritingMode', mode: 'each' },
					asker,
				),
			'failed-precondition',
		);
	});

	it('lets an admin jump a table to talk / write / rate / next turn from any step', () => {
		expect(applyTableAction(table({ step: 'rate' }), { action: 'toTalk' }, admin).step).toBe(
			'talk',
		);
		expect(applyTableAction(table({ step: 'pick' }), { action: 'toRate' }, admin).step).toBe(
			'rate',
		);
		expect(applyTableAction(table({ step: 'rate' }), { action: 'toWrite' }, admin).step).toBe(
			'write',
		);
		expect(applyTableAction(table({ step: 'pick' }), { action: 'nextTurn' }, admin).turn).toBe(2);
	});

	it('keeps step-bound preconditions for admins too', () => {
		expectRefusal(
			() => applyTableAction(table({ step: 'pick' }), { action: 'nextSpeaker', uid: 'b' }, admin),
			'failed-precondition',
		);
	});

	it('refuses a next speaker who is not at the table', () => {
		expectRefusal(
			() => applyTableAction(table({ step: 'talk' }), { action: 'nextSpeaker', uid: 'zz' }, asker),
			'invalid-argument',
		);
	});

	it('refuses a writing-mode change after the first send', () => {
		expectRefusal(
			() =>
				applyTableAction(
					table({ step: 'write', writingLocked: true }),
					{ action: 'setWritingMode', mode: 'table' },
					asker,
				),
			'failed-precondition',
		);
	});

	it('refuses a question already asked at this table, but a re-pick frees the previous one', () => {
		expectRefusal(
			() =>
				applyTableAction(
					table({ usedQuestionIds: ['q1'] }),
					{ action: 'pickQuestion', questionId: 'q1' },
					asker,
				),
			'failed-precondition',
		);
		const picked = table({ questionId: 'q1', usedQuestionIds: ['q0', 'q1'] });
		const repicked = applyTableAction(picked, { action: 'pickQuestion', questionId: 'q2' }, asker);
		expect(repicked).toMatchObject({ questionId: 'q2', usedQuestionIds: ['q0', 'q2'] });
		// picking the same one again is a no-op, not a refusal
		expect(
			applyTableAction(picked, { action: 'pickQuestion', questionId: 'q1' }, asker).usedQuestionIds,
		).toEqual(['q0', 'q1']);
	});
});

describe('helpers', () => {
	it('everyoneSpoke counts the current speaker only after their minute', () => {
		const t = table({ spokenUids: ['ask', 'b'], speakerUid: 'c', speakerEndsAt: NOW + 1 });
		expect(everyoneSpoke(t, NOW)).toBe(false);
		expect(everyoneSpoke(t, NOW + 1)).toBe(true);
		expect(everyoneSpoke(table({ memberUids: [] }), NOW)).toBe(false);
	});
});
