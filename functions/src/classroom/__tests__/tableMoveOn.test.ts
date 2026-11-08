import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { everyoneSpoke, moveOnNeeded } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { removeMember } from '../tableMembership';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/**
 * "Move on" (Trello 1c8jfvA6, GdrAEIF9): two tablemates (all of a table smaller
 * than three) move the table on without the teacher; a press is a toggle and
 * the presses reset when the table moves.
 */

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const MOVE_ON: ClassTableAction = { action: 'moveOn' };

function talking(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c', 'd'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: 'a',
		questionId: 'q1',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		askedUids: ['a'],
		updatedAt: 0,
		...overrides,
	};
}

const ctxOf = (actorUid: string, lessonStep: 'tableTalk' | 'proposals'): TransitionContext => ({
	actorUid,
	isAdmin: false,
	now: NOW,
	lessonStep,
	speakMs: MINUTE,
});
const press = (t: ClassTable, uid: string, lessonStep: 'tableTalk' | 'proposals'): ClassTable =>
	applyTableAction(t, MOVE_ON, ctxOf(uid, lessonStep));

function refusal(t: ClassTable, uid: string, lessonStep: 'tableTalk' | 'proposals') {
	try {
		press(t, uid, lessonStep);
	} catch (error) {
		if (error instanceof ClassroomError) return { code: error.code, reason: error.reason };
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('moveOnNeeded', () => {
	it('is 2 from three students up, everyone below', () => {
		expect(moveOnNeeded(6)).toBe(2);
		expect(moveOnNeeded(3)).toBe(2);
		expect(moveOnNeeded(2)).toBe(2);
		expect(moveOnNeeded(1)).toBe(1);
		expect(moveOnNeeded(0)).toBe(1);
	});
});

describe('move on at Table talk', () => {
	it('one press at a 4-table does not move it, and records the press', () => {
		const next = press(talking(), 'b', 'tableTalk');
		expect(next.moveOnUids).toEqual(['b']);
		expect(everyoneSpoke(next, NOW)).toBe(false);
		expect(next.step).toBe('talk');
	});

	it('two different presses at a 4-table move it on: everyone who has not answered is passed', () => {
		const first = press(talking({ spokenUids: ['c'] }), 'b', 'tableTalk');
		const next = press(first, 'd', 'tableTalk');
		expect(everyoneSpoke(next, NOW)).toBe(true);
		expect([...(next.passedSpeakingUids ?? [])].sort()).toEqual(['a', 'b', 'd']);
		expect(next.moveOnUids).toBeUndefined();
		expect(next.questionId).toBe('q1');
	});

	it('a running minute is cut short as answered, not passed', () => {
		const running = talking({ speakerUid: 'b', speakerEndsAt: NOW + MINUTE, speakerMs: MINUTE });
		const next = press(press(running, 'c', 'tableTalk'), 'd', 'tableTalk');
		expect(next.speakerUid).toBeUndefined();
		expect(next.spokenUids).toContain('b');
		expect(next.passedSpeakingUids ?? []).not.toContain('b');
	});

	it('the same student pressing twice withdraws the press', () => {
		const once = press(talking(), 'b', 'tableTalk');
		const twice = press(once, 'b', 'tableTalk');
		expect(twice.moveOnUids).toEqual([]);
		const again = press(twice, 'c', 'tableTalk');
		expect(again.step).toBe('talk');
		expect(everyoneSpoke(again, NOW)).toBe(false);
	});

	it('a withdrawn press does not count towards the two', () => {
		const t = press(press(talking(), 'b', 'tableTalk'), 'b', 'tableTalk');
		const next = press(t, 'c', 'tableTalk');
		expect(next.moveOnUids).toEqual(['c']);
	});

	it('a 2-table needs both students', () => {
		const pair = talking({ memberUids: ['a', 'b'] });
		const one = press(pair, 'a', 'tableTalk');
		expect(everyoneSpoke(one, NOW)).toBe(false);
		expect(everyoneSpoke(press(one, 'b', 'tableTalk'), NOW)).toBe(true);
	});

	it('a 3-table moves on with two', () => {
		const trio = talking({ memberUids: ['a', 'b', 'c'] });
		expect(everyoneSpoke(press(press(trio, 'a', 'tableTalk'), 'c', 'tableTalk'), NOW)).toBe(true);
	});

	it('presses of a student who left the table do not count', () => {
		const stale = talking({ memberUids: ['a', 'b', 'c', 'd'], moveOnUids: ['gone'] });
		const next = press(stale, 'b', 'tableTalk');
		expect(everyoneSpoke(next, NOW)).toBe(false);
	});

	it('resets the presses when the teacher moves the table', () => {
		const pressed = press(talking(), 'b', 'tableTalk');
		const teacher: TransitionContext = { ...ctxOf('teacher', 'tableTalk'), isAdmin: true };
		const next = applyTableAction(pressed, { action: 'toWrite' }, teacher);
		expect(next.moveOnUids).toBeUndefined();
	});

	it('resets the presses when a new turn starts', () => {
		const moved = press(press(talking(), 'b', 'tableTalk'), 'c', 'tableTalk');
		const claimed = applyTableAction(
			moved,
			{ action: 'claimTurn', fromTurn: 1, questionId: 'q2' },
			ctxOf('b', 'tableTalk'),
		);
		expect(claimed.moveOnUids).toBeUndefined();
		expect(claimed.turn).toBe(2);
	});

	it('refuses a stranger and a table that is not talking', () => {
		expect(refusal(talking(), 'zed', 'tableTalk').code).toBe('permission-denied');
		expect(refusal(talking({ step: 'pick', questionId: undefined }), 'b', 'tableTalk').reason).toBe(
			'not-talking',
		);
		const allDone = talking({ spokenUids: ['a', 'b', 'c', 'd'] });
		expect(refusal(allDone, 'b', 'tableTalk').reason).toBe('not-talking');
	});
});

describe('membership shrinks after a press (the stuck table)', () => {
	it('2-table: A pressed, B leaves -> the table moves on at once', () => {
		const pair = talking({ memberUids: ['a', 'b'], askerUid: null });
		const pressed = press(pair, 'a', 'tableTalk');
		expect(everyoneSpoke(pressed, NOW)).toBe(false);
		const next = removeMember(pressed, 'b', NOW, 'tableTalk');
		expect(next.memberUids).toEqual(['a']);
		expect(everyoneSpoke(next, NOW)).toBe(true);
		expect(next.moveOnUids).toBeUndefined();
	});

	it('3 -> 2: two pressed (enough already), the third leaves -> still moves', () => {
		const trio = talking({ memberUids: ['a', 'b', 'c'], askerUid: null, moveOnUids: ['a'] });
		const next = removeMember(trio, 'c', NOW, 'tableTalk');
		expect(everyoneSpoke(next, NOW)).toBe(false);
		// 3 -> 2 with one press: a 2-table needs both, so it waits for B
		expect(next.moveOnUids).toEqual(['a']);
		const moved = removeMember(
			talking({ memberUids: ['a', 'b', 'c'], askerUid: null, moveOnUids: ['a', 'b'] }),
			'c',
			NOW,
			'tableTalk',
		);
		expect(everyoneSpoke(moved, NOW)).toBe(true);
	});

	it("the leaver's own press is dropped, not counted", () => {
		const pair = talking({ memberUids: ['a', 'b'], askerUid: null, moveOnUids: ['b'] });
		const next = removeMember(pair, 'b', NOW, 'tableTalk');
		// A alone needs one press; B's is gone
		expect(next.moveOnUids).toEqual([]);
		expect(everyoneSpoke(next, NOW)).toBe(false);
	});

	it('Proposals: A pressed, B leaves -> the table goes to write', () => {
		const pair = talking({
			memberUids: ['a', 'b'],
			askerUid: null,
			questionId: undefined,
			usedQuestionIds: [],
		});
		const pressed = press(pair, 'a', 'proposals');
		const next = removeMember(pressed, 'b', NOW, 'proposals');
		expect(next.step).toBe('write');
		expect(next.moveOnUids).toBeUndefined();
	});

	it('nothing moves when no one pressed', () => {
		const pair = talking({ memberUids: ['a', 'b'], askerUid: null });
		expect(removeMember(pair, 'b', NOW, 'tableTalk').step).toBe('talk');
		expect(everyoneSpoke(removeMember(pair, 'b', NOW, 'tableTalk'), NOW)).toBe(false);
	});
});

describe('a press that finds the threshold already reached', () => {
	it('moves the table instead of withdrawing the press', () => {
		const stuck = talking({ memberUids: ['a'], askerUid: null, moveOnUids: ['a'] });
		const next = press(stuck, 'a', 'tableTalk');
		expect(everyoneSpoke(next, NOW)).toBe(true);
		expect(next.moveOnUids).toBeUndefined();
	});
});

describe('a late tap from an earlier turn', () => {
	const tap = (
		t: ClassTable,
		uid: string,
		extra: Partial<{ fromTurn: number; fromProposalsTurn: number }>,
	) => applyTableAction(t, { action: 'moveOn', ...extra }, ctxOf(uid, 'tableTalk'));

	it('is ignored and not counted in the new turn', () => {
		const second = talking({ turn: 2 });
		const next = tap(second, 'b', { fromTurn: 1 });
		expect(next.moveOnUids).toBeUndefined();
		expect(tap(second, 'b', { fromTurn: 2 }).moveOnUids).toEqual(['b']);
	});

	it('at Proposals a tap from the previous proposals turn is ignored', () => {
		const t2 = talking({
			questionId: undefined,
			usedQuestionIds: [],
			askerUid: null,
			proposalsTurn: 2,
		});
		const ignored = applyTableAction(
			t2,
			{ action: 'moveOn', fromTurn: 1, fromProposalsTurn: 1 },
			ctxOf('b', 'proposals'),
		);
		expect(ignored.moveOnUids).toBeUndefined();
	});
});

describe('move on at Proposals talk', () => {
	const proposals = (overrides: Partial<ClassTable> = {}): ClassTable =>
		talking({ questionId: undefined, usedQuestionIds: [], askerUid: null, ...overrides });

	it('one press at a 4-table stays at talk', () => {
		const next = press(proposals(), 'b', 'proposals');
		expect(next.step).toBe('talk');
		expect(next.moveOnUids).toEqual(['b']);
	});

	it('two presses move the table to write and reset the presses', () => {
		const next = press(press(proposals(), 'b', 'proposals'), 'd', 'proposals');
		expect(next.step).toBe('write');
		expect(next.moveOnUids).toBeUndefined();
	});

	it('works for a table that sits at pick (nobody asked)', () => {
		const next = press(press(proposals({ step: 'pick' }), 'b', 'proposals'), 'c', 'proposals');
		expect(next.step).toBe('write');
	});

	it('a 2-table needs both', () => {
		const pair = proposals({ memberUids: ['a', 'b'] });
		expect(press(pair, 'a', 'proposals').step).toBe('talk');
		expect(press(press(pair, 'a', 'proposals'), 'b', 'proposals').step).toBe('write');
	});

	it('refuses once the table is at write', () => {
		expect(refusal(proposals({ step: 'write' }), 'b', 'proposals').reason).toBe('already-moved');
	});
});
