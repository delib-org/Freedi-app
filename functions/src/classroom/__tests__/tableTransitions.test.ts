import { SPEAK_SECONDS } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { applyTableAction, everyoneSpoke, nextAsker, TransitionContext } from '../tableTransitions';
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

		t = applyTableAction(t, { action: 'nextSpeaker', uid: 'b' }, asker);
		expect(t).toMatchObject({
			speakerUid: 'b',
			speakerEndsAt: NOW + SPEAK_SECONDS * 1000,
			spokenUids: [],
		});

		t = applyTableAction(t, { action: 'nextSpeaker', uid: 'c' }, { ...asker, now: NOW + 1000 });
		expect(t).toMatchObject({ speakerUid: 'c', spokenUids: ['b'] });

		t = applyTableAction(t, { action: 'setWritingMode', mode: 'table' }, asker);
		t = applyTableAction(t, { action: 'toWrite' }, asker);
		expect(t).toMatchObject({ step: 'write', writingMode: 'table', spokenUids: ['b', 'c'] });
		expect(t.speakerUid).toBeUndefined();
		expect(t.speakerEndsAt).toBeUndefined();

		t = applyTableAction(t, { action: 'toRate' }, asker);
		expect(t.step).toBe('rate');

		// the asker cannot hand the turn on; the first tablemate to tap claims it
		expectRefusal(
			() => applyTableAction({ ...t, writingLocked: true }, { action: 'nextTurn' }, asker),
			'permission-denied',
		);
		t = applyTableAction({ ...t, writingLocked: true }, { action: 'nextTurn' }, member);
		expect(t).toMatchObject({
			step: 'pick',
			turn: 2,
			askerUid: 'b',
			askedUids: ['ask'],
			writingMode: 'each',
			writingLocked: false,
			spokenUids: [],
			usedQuestionIds: ['q1'],
		});
		expect(t.questionId).toBeUndefined();
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
	it('nextAsker rotates in seating order and wraps', () => {
		expect(nextAsker(['a', 'b', 'c'], 'a')).toBe('b');
		expect(nextAsker(['a', 'b', 'c'], 'c')).toBe('a');
		expect(nextAsker(['a', 'b', 'c'], null)).toBe('a');
		expect(nextAsker(['a', 'b', 'c'], 'gone')).toBe('a');
		expect(nextAsker([], 'a')).toBeNull();
	});

	it('everyoneSpoke counts the current speaker only after their minute', () => {
		const t = table({ spokenUids: ['ask', 'b'], speakerUid: 'c', speakerEndsAt: NOW + 1 });
		expect(everyoneSpoke(t, NOW)).toBe(false);
		expect(everyoneSpoke(t, NOW + 1)).toBe(true);
		expect(everyoneSpoke(table({ memberUids: [] }), NOW)).toBe(false);
	});
});

function reasonOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		return (error as ClassroomError).reason;
	}

	return undefined;
}

describe('applyTableAction — every tablemate asks once (the claim)', () => {
	const c: TransitionContext = { actorUid: 'c', isAdmin: false, now: NOW };

	it('lets any not-yet tablemate claim from rate; the claimer asks, the old asker is marked', () => {
		const t = table({ step: 'rate', turn: 1, questionId: 'q1', spokenUids: ['ask', 'b', 'c'] });
		const next = applyTableAction(t, { action: 'nextTurn' }, c);
		expect(next).toMatchObject({ step: 'pick', turn: 2, askerUid: 'c', askedUids: ['ask'] });
		expect(next.questionId).toBeUndefined();
		expect(next.speakerUid).toBeUndefined();
		expect(next.spokenUids).toEqual([]);
	});

	it('keeps first-tap-wins: the second claim finds the step moved (turn-claimed, no permission error)', () => {
		const rate = table({ step: 'rate' });
		const won = applyTableAction(rate, { action: 'nextTurn' }, member);
		const run = () => applyTableAction(won, { action: 'nextTurn' }, c);
		expectRefusal(run, 'failed-precondition');
		expect(reasonOf(run)).toBe('turn-claimed');
	});

	it('refuses a claim by someone who already asked (already-asked), at any step', () => {
		const asked = table({ step: 'rate', askerUid: 'b', askedUids: ['ask'] });
		const forged = () => applyTableAction(asked, { action: 'nextTurn' }, asker);
		expectRefusal(forged, 'permission-denied');
		expect(reasonOf(forged)).toBe('already-asked');
		const later = table({ step: 'pick', askerUid: 'b', askedUids: ['ask'] });
		expect(reasonOf(() => applyTableAction(later, { action: 'nextTurn' }, asker))).toBe(
			'already-asked',
		);
	});

	it('refuses a claim from any step but rate, and by the current asker', () => {
		for (const step of ['pick', 'talk', 'write'] as const) {
			const run = () => applyTableAction(table({ step }), { action: 'nextTurn' }, member);
			expectRefusal(run, 'failed-precondition');
			expect(reasonOf(run)).toBe('turn-claimed');
		}
		expectRefusal(
			() => applyTableAction(table({ step: 'rate' }), { action: 'nextTurn' }, asker),
			'permission-denied',
		);
	});

	it('lets the last tablemate claim, then the table is out of askers for a teacher', () => {
		const t = table({ step: 'rate', askerUid: 'b', askedUids: ['ask'] });
		const last = applyTableAction(t, { action: 'nextTurn' }, c);
		expect(last).toMatchObject({ askerUid: 'c', askedUids: ['ask', 'b'], turn: 2 });
		const end = { ...last, step: 'rate' as const };
		const run = () => applyTableAction(end, { action: 'nextTurn' }, admin);
		expectRefusal(run, 'failed-precondition');
		expect(reasonOf(run)).toBe('all-asked');
	});

	it("gives a teacher's next turn to the first tablemate who has not asked, in seating order", () => {
		const t = table({ memberUids: ['ask', 'b', 'c', 'd'], step: 'rate', askedUids: ['b'] });
		expect(applyTableAction(t, { action: 'nextTurn' }, admin)).toMatchObject({
			askerUid: 'c',
			askedUids: ['b', 'ask'],
			turn: 2,
		});
	});

	it('reads a missing askedUids as empty', () => {
		expect(table().askedUids).toBeUndefined();
		const next = applyTableAction(table({ step: 'rate' }), { action: 'nextTurn' }, admin);
		expect(next.askedUids).toEqual(['ask']);
	});

	it('passAsker: teacher only, at pick, to a not-yet tablemate, without spending a turn', () => {
		const t = table({ askedUids: ['b'], usedQuestionIds: ['q1'] });
		const passed = applyTableAction(t, { action: 'passAsker', uid: 'c' }, admin);
		expect(passed).toMatchObject({
			askerUid: 'c',
			turn: 1,
			askedUids: ['b'],
			usedQuestionIds: ['q1'],
		});
		expectRefusal(
			() => applyTableAction(t, { action: 'passAsker', uid: 'b' }, admin),
			'invalid-argument',
		);
		expectRefusal(
			() => applyTableAction(t, { action: 'passAsker', uid: 'zz' }, admin),
			'invalid-argument',
		);
		expectRefusal(
			() => applyTableAction(table({ step: 'talk' }), { action: 'passAsker', uid: 'c' }, admin),
			'failed-precondition',
		);
		expectRefusal(
			() => applyTableAction(t, { action: 'passAsker', uid: 'c' }, asker),
			'permission-denied',
		);
	});
});
