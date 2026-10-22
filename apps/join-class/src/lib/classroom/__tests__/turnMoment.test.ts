import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement } from '@freedi/shared-types';
import {
	askerStates,
	instructionFor,
	myAnswer,
	namesOf,
	rateMoment,
	refusalReason,
	sentCount,
	type InstructionInput,
} from '../turnMoment';

const MATES = [
	{ uid: 'dana', name: 'Dana' },
	{ uid: 'noa', name: 'Noa' },
	{ uid: 'omri', name: 'Omri' },
	{ uid: 'lior', name: 'Lior' },
];

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: MATES.map((x) => x.uid),
		noDeviceMembers: [],
		step: 'pick',
		askerUid: 'dana',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

function answer(
	by: string,
	extra: Partial<Statement['classTable']> = {},
	parentId = 'q1',
): Statement {
	return {
		statementId: `a-${by}`,
		parentId,
		creatorId: by,
		statement: `by ${by}`,
		createdAt: 1,
		classTable: { tableId: 'm--3', shared: false, coAuthors: [], ...extra },
	} as Statement;
}

function input(
	over: Partial<InstructionInput> & { table: ClassTable; uid: string },
): InstructionInput {
	return { kind: 'tableTalk', mates: MATES, timeUp: false, ...over };
}

describe('askerStates', () => {
	it('turn 1 at pick: the asker is now, everyone else not yet', () => {
		const states = askerStates(table(), MATES).map((c) => c.state);
		expect(states).toEqual(['now', 'wait', 'wait', 'wait']);
	});

	it('at rate the current asker counts as done; asked tablemates stay done', () => {
		const t2 = table({ step: 'rate', askerUid: 'noa', askedUids: ['dana'], turn: 2 });
		expect(askerStates(t2, MATES).map((c) => c.state)).toEqual(['done', 'done', 'wait', 'wait']);
	});

	it('turn 2 at pick: the claimer is now, the old asker is done', () => {
		const t2 = table({ askerUid: 'omri', askedUids: ['dana'], turn: 2 });
		expect(askerStates(t2, MATES).map((c) => c.state)).toEqual(['done', 'wait', 'now', 'wait']);
	});

	it('keeps seating order and names; a missing askedUids reads as empty', () => {
		const chips = askerStates(table(), MATES);
		expect(chips.map((c) => c.name)).toEqual(['Dana', 'Noa', 'Omri', 'Lior']);
		expect(table().askedUids).toBeUndefined();
	});

	it('the last turn at rate is all done', () => {
		const last = table({
			step: 'rate',
			askerUid: 'lior',
			askedUids: ['dana', 'noa', 'omri'],
			turn: 4,
		});
		expect(askerStates(last, MATES).every((c) => c.state === 'done')).toBe(true);
	});
});

describe('rateMoment (the hand-off)', () => {
	it('F-open: every not-yet student has the card and the open instruction; the asker has neither', () => {
		const rate = table({ step: 'rate' });
		for (const uid of ['noa', 'omri', 'lior']) {
			expect(rateMoment(rate, uid)).toMatchObject({
				card: 'open',
				instructionKey: 'turn.instr_rate_open',
				allAsked: false,
				nextUids: ['noa', 'omri', 'lior'],
			});
		}
		expect(rateMoment(rate, 'dana')).toMatchObject({
			card: null,
			instructionKey: 'turn.instr_rate',
		});
	});

	it('after one claim the claimed-out students stop being claimers', () => {
		const rate = table({ step: 'rate', askerUid: 'noa', askedUids: ['dana'], turn: 2 });
		expect(rateMoment(rate, 'dana')).toMatchObject({ card: null, nextUids: ['omri', 'lior'] });
		expect(rateMoment(rate, 'omri').card).toBe('open');
	});

	it('F-one: only the last student left has the card, worded "your turn"', () => {
		const rate = table({ step: 'rate', askerUid: 'omri', askedUids: ['dana', 'noa'], turn: 3 });
		expect(rateMoment(rate, 'lior')).toMatchObject({
			card: 'one',
			instructionKey: 'turn.instr_rate_next',
			nextUids: ['lior'],
		});
		for (const uid of ['dana', 'noa', 'omri']) expect(rateMoment(rate, uid).card).toBeNull();
	});

	it('F-all: nobody has a card; everyone is told to wait for the other tables', () => {
		const rate = table({
			step: 'rate',
			askerUid: 'lior',
			askedUids: ['dana', 'noa', 'omri'],
			turn: 4,
		});
		for (const m of MATES) {
			expect(rateMoment(rate, m.uid)).toMatchObject({
				card: null,
				allAsked: true,
				instructionKey: 'turn.wait_others',
			});
		}
	});
});

describe('instructionFor (one instruction per moment)', () => {
	it('pick: the asker chooses; the others are told whose turn it is', () => {
		expect(instructionFor('pick', input({ table: table(), uid: 'dana' }), '?').key).toBe(
			'turn.instr_pick',
		);
		expect(instructionFor('pick', input({ table: table(), uid: 'noa' }), '?')).toEqual({
			key: 'turn.instr_pick_other',
			params: { name: 'Dana' },
		});
	});

	it('talk before the first speaker: the asker reads aloud, the others listen', () => {
		const t = table({ step: 'talk' });
		expect(instructionFor('talk', input({ table: t, uid: 'dana' }), '?').key).toBe(
			'turn.instr_read',
		);
		expect(instructionFor('talk', input({ table: t, uid: 'noa' }), '?').key).toBe(
			'turn.instr_listen',
		);
	});

	it('talk while a minute runs, when it is over, and when everyone spoke', () => {
		const running = table({ step: 'talk', speakerUid: 'noa', spokenUids: ['dana'] });
		expect(instructionFor('talk', input({ table: running, uid: 'omri' }), '?').key).toBe(
			'turn.instr_talk',
		);
		expect(
			instructionFor('talk', input({ table: running, uid: 'omri', timeUp: true }), '?').key,
		).toBe('turn.time_up');
		const done = table({ step: 'talk', speakerUid: 'lior', spokenUids: ['dana', 'noa', 'omri'] });
		expect(instructionFor('talk', input({ table: done, uid: 'omri', timeUp: true }), '?').key).toBe(
			'turn.all_spoke',
		);
	});

	it('write: everyone writes; in one-answer mode the others help out loud', () => {
		const each = table({ step: 'write' });
		expect(instructionFor('write', input({ table: each, uid: 'noa' }), '?').key).toBe(
			'turn.instr_write',
		);
		const shared = table({ step: 'write', writingMode: 'table' });
		expect(instructionFor('write', input({ table: shared, uid: 'dana' }), '?').key).toBe(
			'turn.instr_write',
		);
		expect(instructionFor('write', input({ table: shared, uid: 'noa' }), '?')).toEqual({
			key: 'turn.instr_help',
			params: { name: 'Dana' },
		});
	});

	it('rate follows the hand-off; proposals keep the terse words', () => {
		const rate = table({ step: 'rate' });
		expect(instructionFor('rate', input({ table: rate, uid: 'noa' }), '?').key).toBe(
			'turn.instr_rate_open',
		);
		expect(
			instructionFor('write', input({ kind: 'proposals', table: rate, uid: 'noa' }), '?').key,
		).toBe('turn.instr_write_proposals');
		expect(
			instructionFor('rate', input({ kind: 'proposals', table: rate, uid: 'noa' }), '?').key,
		).toBe('turn.instr_rate_proposals');
	});

	it('uses the fallback name when the asker is not loaded', () => {
		expect(
			instructionFor('pick', input({ table: table({ askerUid: 'ghost' }), uid: 'noa' }), 'someone'),
		).toEqual({ key: 'turn.instr_pick_other', params: { name: 'someone' } });
	});
});

describe('sentCount + myAnswer', () => {
	const asked = table({ step: 'rate', questionId: 'q1' });

	it("counts the tablemates who wrote an answer to this turn's question", () => {
		const options = [answer('dana'), answer('noa'), answer('x', {}, 'other-question')];
		expect(sentCount(asked, options)).toEqual({ n: 2, m: 4 });
	});

	it('counts co-authors of a shared answer and ignores people outside the table', () => {
		const shared = answer('dana', { shared: true, coAuthors: ['noa', 'omri', 'stranger'] });
		expect(sentCount(asked, [shared])).toEqual({ n: 3, m: 4 });
	});

	it('ignores answers of another table and a table without a question', () => {
		const other = {
			...answer('dana'),
			classTable: { tableId: 'm--9', shared: false, coAuthors: [] },
		};
		expect(sentCount(asked, [other as Statement])).toEqual({ n: 0, m: 4 });
		expect(sentCount(table(), [answer('dana')])).toEqual({ n: 0, m: 4 });
	});

	it('myAnswer finds what I wrote or co-wrote, newest first', () => {
		const mine = answer('noa');
		const shared = answer('dana', { shared: true, coAuthors: ['noa'] });
		expect(myAnswer(asked, [shared], 'noa')?.statementId).toBe('a-dana');
		expect(myAnswer(asked, [shared, { ...mine, createdAt: 9 }], 'noa')?.statementId).toBe('a-noa');
		expect(myAnswer(asked, [shared], 'lior')).toBeNull();
		expect(myAnswer(table(), [mine], 'noa')).toBeNull();
	});
});

describe('namesOf + refusalReason', () => {
	it('names in the given order, with a fallback for an unknown uid', () => {
		expect(namesOf(['omri', 'noa', 'zz'], MATES, 'someone')).toEqual(['Omri', 'Noa', 'someone']);
	});

	it('reads the engine reason out of a callable error, and nothing out of anything else', () => {
		expect(refusalReason({ code: 'x', details: { reason: 'turn-claimed' } })).toBe('turn-claimed');
		expect(refusalReason({ details: { reason: 7 } })).toBeNull();
		expect(refusalReason({ details: 'x' })).toBeNull();
		expect(refusalReason(new Error('boom'))).toBeNull();
		expect(refusalReason(null)).toBeNull();
	});
});
