import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { instructionFor, isRaceRefusal, maxTurns, namesOf, refusalReason } from '../turnMoment';

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

describe('maxTurns (the "of n" of the header)', () => {
	it('is one turn per member who has not passed on asking', () => {
		expect(maxTurns(table())).toBe(4);
		expect(maxTurns(table({ passedAskingUids: ['lior'] }))).toBe(3);
	});

	it('never reads lower than the current turn', () => {
		expect(maxTurns(table({ turn: 4, passedAskingUids: ['dana', 'noa', 'omri', 'lior'] }))).toBe(4);
	});
});

describe('instructionFor (Proposals only; Table talk has its own states)', () => {
	it('talk, write and rate each have one instruction', () => {
		expect(instructionFor('talk').key).toBe('turn.instr_talk');
		expect(instructionFor('write').key).toBe('turn.instr_write_proposals');
		expect(instructionFor('rate').key).toBe('turn.instr_rate_proposals');
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

describe('isRaceRefusal (the lost races the screen swallows)', () => {
	it('swallows "someone was first" refusals and nothing else', () => {
		for (const reason of ['turn-claimed', 'floor-taken', 'already-answered', 'others-first']) {
			expect(isRaceRefusal({ details: { reason } })).toBe(true);
		}
		expect(isRaceRefusal({ details: { reason: 'question-used' } })).toBe(false);
		expect(isRaceRefusal(new Error('network'))).toBe(false);
	});
});
