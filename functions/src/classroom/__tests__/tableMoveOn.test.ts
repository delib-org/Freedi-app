import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { everyoneSpoke, moveOnNeeded } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
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
