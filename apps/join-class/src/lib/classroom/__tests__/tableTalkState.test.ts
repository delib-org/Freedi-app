import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { hasAnswered, passedAnswer, tableTalkState } from '../tableTalkState';

const NOW = 1_800_000_000_000;

/** Pick of turn 1: nobody has asked. Dan, Tal, Noa have phones. */
function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: ['dan', 'tal', 'noa'],
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

/** Tal asked q1; nobody answered yet. */
function talking(overrides: Partial<ClassTable> = {}): ClassTable {
	return table({
		step: 'talk',
		askerUid: 'tal',
		questionId: 'q1',
		usedQuestionIds: ['q1'],
		askedUids: ['tal'],
		...overrides,
	});
}

describe('tableTalkState: the eight screens (Tal drawing, columns 1-6)', () => {
	it('col 1: everyone who has not asked sees the pick list (P1); a student who asked or passed waits (P2)', () => {
		expect(tableTalkState(table(), 'dan', NOW)).toBe('P1');
		expect(tableTalkState(table(), 'tal', NOW)).toBe('P1');
		const later = table({ askedUids: ['tal'], passedAskingUids: ['noa'] });
		expect(tableTalkState(later, 'dan', NOW)).toBe('P1');
		expect(tableTalkState(later, 'tal', NOW)).toBe('P2');
		expect(tableTalkState(later, 'noa', NOW)).toBe('P2');
	});

	it('col 2: after the claim Dan may answer (A) and Tal, the asker, waits (W)', () => {
		expect(tableTalkState(talking(), 'dan', NOW)).toBe('A');
		expect(tableTalkState(talking(), 'tal', NOW)).toBe('W');
	});

	it('col 3: Dan holds the floor (S), Tal and Noa watch the clock (L)', () => {
		const running = talking({ speakerUid: 'dan', speakerEndsAt: NOW + 59_000 });
		expect(tableTalkState(running, 'dan', NOW)).toBe('S');
		expect(tableTalkState(running, 'tal', NOW)).toBe('L');
		expect(tableTalkState(running, 'noa', NOW)).toBe('L');
	});

	it('col 4: the minute ends with no write: Dan has had his turn (H), Tal may now answer (A), Noa still may (A)', () => {
		const ended = talking({ speakerUid: 'dan', speakerEndsAt: NOW - 1 });
		expect(tableTalkState(ended, 'dan', NOW)).toBe('H');
		expect(tableTalkState(ended, 'tal', NOW)).toBe('A');
		expect(tableTalkState(ended, 'noa', NOW)).toBe('A');
	});

	it('col 5: Tal answers (S), Dan watches with his footnote (L)', () => {
		const second = talking({
			spokenUids: ['dan'],
			speakerUid: 'tal',
			speakerEndsAt: NOW + 59_000,
		});
		expect(tableTalkState(second, 'tal', NOW)).toBe('S');
		expect(tableTalkState(second, 'dan', NOW)).toBe('L');
		expect(hasAnswered(second, 'dan', NOW)).toBe(true);
	});

	it('col 6: when the last minute ends the pick list is back for Dan (P1) and Tal waits (P2)', () => {
		const over = talking({
			spokenUids: ['dan', 'noa'],
			speakerUid: 'tal',
			speakerEndsAt: NOW - 1,
		});
		expect(tableTalkState(over, 'dan', NOW)).toBe('P1');
		expect(tableTalkState(over, 'tal', NOW)).toBe('P2');
	});

	it('D: when everyone asked or passed asking and the talk is over', () => {
		const done = talking({
			askedUids: ['tal', 'dan'],
			passedAskingUids: ['noa'],
			spokenUids: ['dan', 'noa', 'tal'],
		});
		for (const uid of ['dan', 'tal', 'noa']) expect(tableTalkState(done, uid, NOW)).toBe('D');
	});
});

describe('tableTalkState: passes and edge cases', () => {
	it('a student who passed answering is in H, not A; passedAnswer says it', () => {
		const passed = talking({ spokenUids: ['noa'], passedSpeakingUids: ['noa'] });
		expect(tableTalkState(passed, 'noa', NOW)).toBe('H');
		expect(passedAnswer(passed, 'noa')).toBe(true);
		expect(passedAnswer(passed, 'dan')).toBe(false);
	});

	it('one pass does not unlock the asker; every other tablemate passing does', () => {
		const one = talking({ spokenUids: ['noa'], passedSpeakingUids: ['noa'] });
		expect(tableTalkState(one, 'tal', NOW)).toBe('W');
		const all = talking({
			spokenUids: ['noa', 'dan'],
			passedSpeakingUids: ['noa', 'dan'],
		});
		expect(tableTalkState(all, 'tal', NOW)).toBe('A');
	});

	it('a table left at write or rate before v3 is drawn as choosing', () => {
		const old = table({ step: 'rate', askerUid: 'tal', askedUids: ['tal'], questionId: 'q1' });
		expect(tableTalkState(old, 'dan', NOW)).toBe('P1');
		expect(tableTalkState(old, 'tal', NOW)).toBe('P2');
	});

	it('a no-device speaker shows as L for everyone with a phone', () => {
		const nd = talking({
			noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }],
			speakerUid: 'nd_1',
			speakerEndsAt: NOW + 30_000,
		});
		expect(tableTalkState(nd, 'dan', NOW)).toBe('L');
		expect(tableTalkState(nd, 'tal', NOW)).toBe('L');
	});

	it('a no-device member never holds up the next pick', () => {
		const over = talking({
			noDeviceMembers: [{ id: 'nd_1', name: 'Yossi' }],
			spokenUids: ['dan', 'noa', 'tal'],
		});
		expect(tableTalkState(over, 'dan', NOW)).toBe('P1');
	});
});

describe('tableTalkState with no question left (own questions off)', () => {
	it('is done at pick when every teacher question was asked', () => {
		expect(tableTalkState(table({ usedQuestionIds: ['q1'] }), 'dan', NOW, true)).toBe('D');
	});

	it('is not done by default (own questions on)', () => {
		expect(tableTalkState(table({ usedQuestionIds: ['q1'] }), 'dan', NOW)).toBe('P1');
	});

	it('keeps the talk running while the last question is being answered', () => {
		expect(tableTalkState(talking(), 'dan', NOW, true)).not.toBe('D');
	});
});
