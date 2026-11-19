import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { removeMember } from '../tableMembership';
import { afterProposalSent } from '../tablePen';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/**
 * Proposals pen (Trello 6KEXvzXK, fJij2wMx): one writer per table, the first
 * tap wins, a send or a pass frees the pen, and the table moves to rate once
 * every tablemate with a phone wrote.
 */

const NOW = 1_800_000_000_000;
const CLAIM: ClassTableAction = { action: 'claimPen' };
const PASS: ClassTableAction = { action: 'passWriting' };

function writing(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
		step: 'write',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: ['a', 'b', 'c'],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

function ctxOf(actorUid: string, extra: Partial<TransitionContext> = {}): TransitionContext {
	return { actorUid, isAdmin: false, now: NOW, lessonStep: 'proposals', ...extra };
}

function run(
	t: ClassTable,
	action: ClassTableAction,
	uid: string,
	extra: Partial<TransitionContext> = {},
): ClassTable {
	return applyTableAction(t, action, ctxOf(uid, extra));
}

function reasonOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		if (error instanceof ClassroomError) return error.reason ?? error.code;
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('claimPen', () => {
	it('gives the free pen to the first tablemate who taps', () => {
		const next = run(writing(), CLAIM, 'a');
		expect(next.writerUid).toBe('a');
		expect(next.step).toBe('write');
	});

	it('loses the race: a second tap while the pen is held is refused as pen-taken', () => {
		const held = run(writing(), CLAIM, 'a');
		expect(reasonOf(() => run(held, CLAIM, 'b'))).toBe('pen-taken');
		expect(reasonOf(() => run(held, CLAIM, 'a'))).toBe('pen-taken');
	});

	it('refuses a tablemate who already sent or passed (one proposal each)', () => {
		const t = writing({ writtenUids: ['a'] });
		expect(reasonOf(() => run(t, CLAIM, 'a'))).toBe('already-written');
	});

	it('lets one who sent take the free pen again when the lesson allows unlimited proposals', () => {
		const t = writing({ writtenUids: ['a'] });
		expect(run(t, CLAIM, 'a', { unlimitedProposals: true }).writerUid).toBe('a');
	});

	it('refuses outside the write step, outside Proposals, and for a stranger or a teacher', () => {
		expect(reasonOf(() => run(writing({ step: 'talk' }), CLAIM, 'a'))).toBe('not-writing');
		expect(reasonOf(() => run(writing(), CLAIM, 'a', { lessonStep: 'tableTalk' }))).toBe(
			'not-writing',
		);
		expect(() => run(writing(), CLAIM, 'stranger')).toThrow(ClassroomError);
		expect(() => run(writing(), CLAIM, 'teacher', { isAdmin: true })).toThrow(ClassroomError);
	});

	it('is refused for a stale tab at a table that moved on to rate', () => {
		expect(reasonOf(() => run(writing({ step: 'rate' }), CLAIM, 'a'))).toBeDefined();
	});
});

describe('releasePen', () => {
	it('gives the pen back without counting the holder as written', () => {
		const next = run(writing({ writerUid: 'a' }), { action: 'releasePen' }, 'a');
		expect(next.writerUid).toBeUndefined();
		expect(next.writtenUids).toBeUndefined();
		expect(run(next, CLAIM, 'b').writerUid).toBe('b');
	});

	it('is refused for a tablemate who does not hold the pen', () => {
		expect(reasonOf(() => run(writing({ writerUid: 'a' }), { action: 'releasePen' }, 'b'))).toBe(
			'no-pen',
		);
		expect(reasonOf(() => run(writing(), { action: 'releasePen' }, 'a'))).toBe('no-pen');
	});
});

describe('passWriting', () => {
	it('counts the pass as written without holding the pen', () => {
		const next = run(writing(), PASS, 'a');
		expect(next.writtenUids).toEqual(['a']);
		expect(next.step).toBe('write');
	});

	it('frees the pen when the holder passes', () => {
		const held = writing({ writerUid: 'a' });
		const next = run(held, PASS, 'a');
		expect(next.writerUid).toBeUndefined();
		expect(next.writtenUids).toEqual(['a']);
	});

	it('keeps the pen with its holder when another tablemate passes', () => {
		const next = run(writing({ writerUid: 'a' }), PASS, 'b');
		expect(next.writerUid).toBe('a');
		expect(next.writtenUids).toEqual(['b']);
	});

	it('refuses a second pass of the same tablemate', () => {
		expect(reasonOf(() => run(writing({ writtenUids: ['b'] }), PASS, 'b'))).toBe('already-written');
	});

	it('moves the table to rate when the last tablemate passes', () => {
		const t = writing({ writtenUids: ['a', 'b'], writerUid: 'c' });
		const next = run(t, PASS, 'c');
		expect(next.step).toBe('rate');
		expect(next.writerUid).toBeUndefined();
	});

	it('a tablemate cannot pass for someone else; a teacher must name who and frees the pen', () => {
		expect(() => run(writing(), { action: 'passWriting', uid: 'b' }, 'a')).toThrow(ClassroomError);
		expect(() => run(writing(), PASS, 'teacher', { isAdmin: true })).toThrow(ClassroomError);
		const freed = run(writing({ writerUid: 'b' }), { action: 'passWriting', uid: 'b' }, 'teacher', {
			isAdmin: true,
		});
		expect(freed.writerUid).toBeUndefined();
		expect(freed.writtenUids).toEqual(['b']);
		expect(() =>
			run(writing(), { action: 'passWriting', uid: 'nobody' }, 'teacher', { isAdmin: true }),
		).toThrow(ClassroomError);
	});
});

describe('a tablemate without a phone', () => {
	it('never gates the end of writing: only memberUids count', () => {
		const t = writing({
			memberUids: ['a', 'b'],
			noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }],
			writtenUids: ['a'],
		});
		expect(run(t, PASS, 'b').step).toBe('rate');
	});
});

describe('a proposal that landed (afterProposalSent)', () => {
	it('frees the pen and records the writer', () => {
		const next = afterProposalSent(writing({ writerUid: 'a' }), 'a', NOW);
		expect(next.writerUid).toBeUndefined();
		expect(next.writtenUids).toEqual(['a']);
		expect(next.step).toBe('write');
	});

	it('moves the table to rate when it was the last one', () => {
		const next = afterProposalSent(writing({ writerUid: 'c', writtenUids: ['a', 'b'] }), 'c', NOW);
		expect(next.step).toBe('rate');
	});

	it('does not count the writer twice (unlimited proposals)', () => {
		const next = afterProposalSent(writing({ writerUid: 'a', writtenUids: ['a'] }), 'a', NOW);
		expect(next.writtenUids).toEqual(['a']);
	});

	it('leaves a table that is not at write alone', () => {
		const t = writing({ step: 'rate' });
		expect(afterProposalSent(t, 'a', NOW)).toBe(t);
	});
});

describe('entering and leaving the write step', () => {
	it('toWrite starts the pen afresh, a repeated tap on a writing table keeps it', () => {
		const talking = writing({ step: 'talk', writerUid: 'x', writtenUids: ['x'] });
		const entered = run(talking, { action: 'toWrite' }, 'teacher', { isAdmin: true });
		expect(entered.step).toBe('write');
		expect(entered.writerUid).toBeUndefined();
		expect(entered.writtenUids).toBeUndefined();
		const midWrite = writing({ writerUid: 'a', writtenUids: ['b'] });
		const again = run(midWrite, { action: 'toWrite' }, 'teacher', { isAdmin: true });
		expect(again.writerUid).toBe('a');
		expect(again.writtenUids).toEqual(['b']);
	});

	it('one tablemate moves the whole table to write once everyone spoke (T6)', () => {
		const talking = writing({ step: 'talk', spokenUids: ['a', 'b', 'c'] });
		expect(run(talking, { action: 'toWrite' }, 'b').step).toBe('write');
	});

	it('a stranger cannot move the table to write', () => {
		const talking = writing({ step: 'talk' });
		expect(() => run(talking, { action: 'toWrite' }, 'stranger')).toThrow(ClassroomError);
	});

	it('toRate clears the pen', () => {
		const next = run(writing({ writerUid: 'a' }), { action: 'toRate' }, 'teacher', {
			isAdmin: true,
		});
		expect(next.step).toBe('rate');
		expect(next.writerUid).toBeUndefined();
	});

	it('moving on from talk (two presses) starts write with a free pen', () => {
		const talking = writing({
			step: 'talk',
			spokenUids: ['a'],
			memberUids: ['a', 'b'],
			writerUid: 'z',
			moveOnUids: ['a'],
		});
		const moved = run(talking, { action: 'moveOn' }, 'b');
		expect(moved.step).toBe('write');
		expect(moved.writerUid).toBeUndefined();
	});
});

describe('a tablemate who leaves', () => {
	it('frees the pen they held', () => {
		const next = removeMember(writing({ writerUid: 'a' }), 'a', NOW, 'proposals');
		expect(next.writerUid).toBeUndefined();
		expect(next.memberUids).toEqual(['b', 'c']);
	});

	it('moves the table to rate when the rest had all written', () => {
		const next = removeMember(writing({ writtenUids: ['a', 'b'] }), 'c', NOW, 'proposals');
		expect(next.step).toBe('rate');
	});

	it('does not move a paused lesson, and does not touch another lesson step', () => {
		const t = writing({ writtenUids: ['a', 'b'] });
		expect(removeMember(t, 'c', NOW, 'proposals', true).step).toBe('write');
		expect(removeMember(t, 'c', NOW, 'tableTalk').step).toBe('write');
	});
});

describe('Table talk keeps working as before', () => {
	it('refuses the pen actions in the investigation-questions lesson step', () => {
		expect(reasonOf(() => run(writing(), PASS, 'a', { lessonStep: 'tableTalk' }))).toBe(
			'not-writing',
		);
	});

	it('toWrite at Table talk does not need or create pen state', () => {
		const t = writing({
			step: 'talk',
			askerUid: 'a',
			questionId: 'q',
			spokenUids: ['a', 'b', 'c'],
		});
		const next = run(t, { action: 'toWrite' }, 'a', { lessonStep: 'tableTalk' });
		expect(next.step).toBe('write');
		expect(next.writerUid).toBeUndefined();
	});
});
