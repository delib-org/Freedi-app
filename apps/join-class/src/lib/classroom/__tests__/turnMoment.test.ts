import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import {
	askerStates,
	claimMoment,
	instructionFor,
	maxTurns,
	namesOf,
	refusalReason,
	talkIsOver,
	type InstructionInput,
} from '../turnMoment';

const NOW = 1_800_000_000_000;

const MATES = [
	{ uid: 'dana', name: 'Dana' },
	{ uid: 'noa', name: 'Noa' },
	{ uid: 'omri', name: 'Omri' },
	{ uid: 'lior', name: 'Lior' },
];

/** V1 of turn 1: nobody asks yet. */
function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: MATES.map((x) => x.uid),
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

/** Noa is asking, everyone spoke or passed: V2 of turn 1. */
function v2(overrides: Partial<ClassTable> = {}): ClassTable {
	return table({
		step: 'talk',
		askerUid: 'noa',
		questionId: 'q1',
		askedUids: ['noa'],
		spokenUids: ['noa', 'dana', 'omri', 'lior'],
		...overrides,
	});
}

function input(
	over: Partial<InstructionInput> & { table: ClassTable; uid: string },
): InstructionInput {
	return { kind: 'tableTalk', mates: MATES, timeUp: false, now: NOW, ...over };
}

describe('claimMoment (which of the five moments, and what this student may do)', () => {
	it('V1: nobody asks; every not-yet student may claim or pass', () => {
		for (const { uid } of MATES) {
			expect(claimMoment(table(), uid, NOW)).toMatchObject({
				phase: 'v1',
				canClaim: true,
				canPassAsk: true,
				lastLeft: false,
			});
		}
	});

	it('A: the asker may pass (back to V1), nobody may claim', () => {
		const a = table({ askerUid: 'noa' });
		expect(claimMoment(a, 'noa', NOW)).toMatchObject({
			phase: 'a',
			canClaim: false,
			canPassAsk: true,
		});
		expect(claimMoment(a, 'omri', NOW)).toMatchObject({ canClaim: false, canPassAsk: false });
	});

	it('talk: before everyone spoke nobody claims', () => {
		const talk = table({ step: 'talk', askerUid: 'noa', askedUids: ['noa'], spokenUids: ['noa'] });
		expect(claimMoment(talk, 'omri', NOW)).toMatchObject({ phase: 'talk', canClaim: false });
	});

	it('V2: everyone spoke; the not-yet claim, the asked and the passed do not', () => {
		const t = v2({ passedAskingUids: ['lior'] });
		expect(claimMoment(t, 'dana', NOW)).toMatchObject({ phase: 'v2', canClaim: true });
		expect(claimMoment(t, 'omri', NOW)).toMatchObject({ canClaim: true, canPassAsk: true });
		expect(claimMoment(t, 'noa', NOW)).toMatchObject({ canClaim: false, canPassAsk: false });
		expect(claimMoment(t, 'lior', NOW)).toMatchObject({ canClaim: false, canPassAsk: false });
	});

	it('names the last one left, for everyone else to wait for', () => {
		const last = v2({ askedUids: ['noa', 'dana', 'omri'] });
		expect(claimMoment(last, 'lior', NOW)).toMatchObject({
			lastLeft: true,
			canClaim: true,
			waitingFor: null,
		});
		expect(claimMoment(last, 'dana', NOW)).toMatchObject({ lastLeft: true, waitingFor: 'lior' });
	});

	it('counts the speaker whose minute ran out; a leftover rate table reads as V2', () => {
		const lastMinute = v2({
			spokenUids: ['noa', 'dana', 'omri'],
			speakerUid: 'lior',
			speakerEndsAt: NOW - 1,
		});
		expect(claimMoment(lastMinute, 'dana', NOW).phase).toBe('v2');
		expect(claimMoment({ ...lastMinute, speakerEndsAt: NOW + 5000 }, 'dana', NOW).phase).toBe(
			'talk',
		);
		expect(claimMoment(table({ step: 'rate', askerUid: 'noa' }), 'dana', NOW).phase).toBe('v2');
		expect(talkIsOver(table({ step: 'write' }), NOW)).toBe(true);
	});

	it('done: everyone asked or passed and the last talk is over', () => {
		const done = v2({ askedUids: ['noa', 'dana', 'omri'], passedAskingUids: ['lior'] });
		expect(claimMoment(done, 'dana', NOW)).toMatchObject({ phase: 'done', canClaim: false });
		const allPassed = table({ passedAskingUids: MATES.map((x) => x.uid) });
		expect(claimMoment(allPassed, 'dana', NOW).phase).toBe('done');
		// still talking: not done
		const talking = v2({
			askedUids: ['noa', 'dana', 'omri'],
			passedAskingUids: ['lior'],
			spokenUids: ['noa'],
		});
		expect(claimMoment(talking, 'dana', NOW).phase).toBe('talk');
	});
});

describe('askerStates', () => {
	it('V1: all four are not yet', () => {
		expect(askerStates(table(), MATES, NOW).map((c) => c.state)).toEqual([
			'wait',
			'wait',
			'wait',
			'wait',
		]);
	});

	it('the asker is now until everyone spoke, then done; passed shows its own state', () => {
		const talking = table({
			step: 'talk',
			askerUid: 'noa',
			askedUids: ['noa'],
			passedAskingUids: ['lior'],
			spokenUids: ['noa'],
		});
		expect(askerStates(talking, MATES, NOW).map((c) => c.state)).toEqual([
			'wait',
			'now',
			'wait',
			'passed',
		]);
		const over = { ...talking, spokenUids: ['noa', 'dana', 'omri', 'lior'] };
		expect(askerStates(over, MATES, NOW).map((c) => c.state)).toEqual([
			'wait',
			'done',
			'wait',
			'passed',
		]);
	});

	it('A of turn 2: the old asker is done, the claimer is now', () => {
		const a2 = table({ askerUid: 'omri', askedUids: ['noa'], turn: 2 });
		expect(askerStates(a2, MATES, NOW).map((c) => c.state)).toEqual([
			'wait',
			'done',
			'now',
			'wait',
		]);
	});

	it('keeps seating order and names; a missing list reads as empty', () => {
		expect(askerStates(table(), MATES, NOW).map((c) => c.name)).toEqual([
			'Dana',
			'Noa',
			'Omri',
			'Lior',
		]);
	});
});

describe('maxTurns (device members minus those who passed on asking)', () => {
	it('drops a passer and never goes below the turn it is on', () => {
		expect(maxTurns(table())).toBe(4);
		expect(maxTurns(table({ passedAskingUids: ['lior'] }))).toBe(3);
		expect(maxTurns(table({ passedAskingUids: ['lior', 'omri', 'noa'], turn: 3 }))).toBe(3);
	});

	it('ignores a leaver who passed before leaving', () => {
		expect(maxTurns(table({ passedAskingUids: ['gone'] }))).toBe(4);
	});
});

describe('instructionFor (one instruction per moment)', () => {
	it('V1: "who wants to ask first" at turn 1, "now" later; the last one left is named', () => {
		expect(instructionFor('pick', input({ table: table(), uid: 'noa' }), '?').key).toBe(
			'turn.who_first_asks',
		);
		expect(instructionFor('pick', input({ table: table({ turn: 3 }), uid: 'noa' }), '?').key).toBe(
			'turn.who_asks_again',
		);
		const one = table({ askedUids: ['noa', 'dana', 'omri'], turn: 4 });
		expect(instructionFor('pick', input({ table: one, uid: 'lior' }), '?').key).toBe(
			'turn.last_to_ask',
		);
		expect(instructionFor('pick', input({ table: one, uid: 'dana' }), '?')).toEqual({
			key: 'turn.waiting_for',
			params: { name: 'Lior' },
		});
	});

	it('A: the asker chooses, the others are told whose turn it is', () => {
		const a = table({ askerUid: 'dana' });
		expect(instructionFor('pick', input({ table: a, uid: 'dana' }), '?').key).toBe(
			'turn.instr_pick',
		);
		expect(instructionFor('pick', input({ table: a, uid: 'noa' }), '?')).toEqual({
			key: 'turn.instr_pick_other',
			params: { name: 'Dana' },
		});
	});

	it('A-own: every teacher question was asked, the asker writes one', () => {
		const a = table({ askerUid: 'dana' });
		expect(instructionFor('pick', input({ table: a, uid: 'dana', allUsed: true }), '?').key).toBe(
			'turn.instr_write_own',
		);
		expect(instructionFor('pick', input({ table: a, uid: 'noa', allUsed: true }), '?')).toEqual({
			key: 'turn.instr_write_own_other',
			params: { name: 'Dana' },
		});
	});

	it('talk before the first speaker: the asker reads aloud, the others listen', () => {
		const t = table({ step: 'talk', askerUid: 'dana', askedUids: ['dana'] });
		expect(instructionFor('talk', input({ table: t, uid: 'dana' }), '?').key).toBe(
			'turn.instr_read',
		);
		expect(instructionFor('talk', input({ table: t, uid: 'noa' }), '?').key).toBe(
			'turn.instr_listen',
		);
	});

	it('talk while a minute runs, and when it is over', () => {
		const running = table({
			step: 'talk',
			askerUid: 'dana',
			askedUids: ['dana'],
			speakerUid: 'noa',
			speakerEndsAt: NOW + 30_000,
			spokenUids: ['dana'],
		});
		expect(instructionFor('talk', input({ table: running, uid: 'omri' }), '?').key).toBe(
			'turn.instr_talk',
		);
		expect(
			instructionFor('talk', input({ table: running, uid: 'omri', timeUp: true }), '?').key,
		).toBe('turn.time_up');
	});

	it('V2: who asks now; done: wait for the other tables', () => {
		expect(instructionFor('talk', input({ table: v2(), uid: 'omri' }), '?').key).toBe(
			'turn.who_asks_now',
		);
		const done = v2({ askedUids: ['noa', 'dana', 'omri'], passedAskingUids: ['lior'] });
		expect(instructionFor('talk', input({ table: done, uid: 'omri' }), '?').key).toBe(
			'turn.wait_others',
		);
	});

	it('proposals keep the terse words', () => {
		const rate = table({ step: 'rate' });
		expect(
			instructionFor('talk', input({ kind: 'proposals', table: rate, uid: 'noa' }), '?').key,
		).toBe('turn.instr_talk');
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
