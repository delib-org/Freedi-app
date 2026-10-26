import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import {
	anotherTurnFor,
	askedPassedCounts,
	answerMark,
	askMark,
	quickActionFor,
	statusLine,
	tableIsDone,
} from '../tableTurnConsole';
import { joinNames } from '../listNames';

const NOW = 1_800_000_000_000;

/** V1 of turn 1: nobody asks yet. */
function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: ['dana', 'noa', 'omri', 'lior'],
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

/** Noa asked, everyone spoke or passed: V2. */
function v2(overrides: Partial<ClassTable> = {}): ClassTable {
	return table({
		step: 'talk',
		askerUid: 'noa',
		questionId: 'q',
		askedUids: ['noa'],
		spokenUids: ['noa', 'dana', 'omri', 'lior'],
		...overrides,
	});
}

describe('quickActionFor (one quick button, UX 16.L rev 3)', () => {
	it('Pick: no button (students start the turn themselves)', () => {
		expect(quickActionFor(table(), 'tableTalk', NOW)).toBeNull();
	});

	it('a running minute offers "end the minute"; an open floor offers nothing', () => {
		const running = v2({ spokenUids: ['noa'], speakerUid: 'dana', speakerEndsAt: NOW + 30_000 });
		expect(quickActionFor(running, 'tableTalk', NOW)).toEqual({ kind: 'finish' });
		expect(quickActionFor(v2({ spokenUids: [] }), 'tableTalk', NOW)).toBeNull();
	});

	it('the end of a talk offers no "start the next turn" and no "talk" button any more', () => {
		expect(quickActionFor(v2(), 'tableTalk', NOW)).toBeNull();
		expect(
			quickActionFor(table({ askerUid: 'noa', questionId: 'q' }), 'tableTalk', NOW),
		).toBeNull();
	});

	it('proposals walk talk -> write -> rate; the plenum only rates', () => {
		expect(quickActionFor(table({ step: 'pick' }), 'proposals', NOW)).toEqual({ kind: 'talk' });
		expect(quickActionFor(table({ step: 'talk' }), 'proposals', NOW)).toEqual({ kind: 'write' });
		expect(quickActionFor(table({ step: 'write' }), 'proposals', NOW)).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'proposals', NOW)).toBeNull();
		expect(quickActionFor(table({ step: 'write' }), 'plenum', NOW)).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'plenum', NOW)).toBeNull();
	});

	it('a done table at Proposals keeps its step-forward button ("to write")', () => {
		expect(quickActionFor(table({ step: 'talk' }), 'proposals', NOW)).toEqual({ kind: 'write' });
	});
});

describe('anotherTurnFor (IA 25.6)', () => {
	it('offers "another turn" only on a talking table whose every turn is spoken', () => {
		expect(anotherTurnFor(table({ step: 'talk' }), 'proposals', true)).toEqual({
			kind: 'anotherTurn',
		});
		expect(anotherTurnFor(table({ step: 'talk' }), 'proposals', false)).toBeNull();
		expect(anotherTurnFor(table({ step: 'write' }), 'proposals', true)).toBeNull();
		expect(anotherTurnFor(table({ step: 'rate' }), 'proposals', true)).toBeNull();
		expect(anotherTurnFor(table({ step: 'talk' }), 'plenum', true)).toBeNull();
		expect(anotherTurnFor(table({ step: 'talk' }), 'tableTalk', true)).toBeNull();
	});
});

describe('tableIsDone', () => {
	it('Proposals: done only while the table talks; Table talk its own rule', () => {
		expect(tableIsDone(table({ step: 'talk' }), 'proposals', NOW, false, true)).toBe(true);
		expect(tableIsDone(table({ step: 'write' }), 'proposals', NOW, false, true)).toBe(false);
		expect(tableIsDone(table({ step: 'talk' }), 'proposals', NOW, false, false)).toBe(false);
		expect(tableIsDone(table({ step: 'talk' }), 'plenum', NOW, false, true)).toBe(false);
		expect(tableIsDone(table(), 'tableTalk', NOW)).toBe(false);
	});
});

describe('statusLine (the card second row)', () => {
	it('Pick waits for someone to start, with the time since the table last changed', () => {
		const waiting = table({ updatedAt: NOW - 90_000 });
		expect(statusLine(waiting, 'tableTalk', NOW)).toEqual({
			key: 'console.waiting_start',
			elapsedMs: 90_000,
		});
	});

	it('a running minute says nothing (the timer row says it)', () => {
		const c = v2({ spokenUids: [], speakerUid: 'dana', speakerEndsAt: NOW + 5000 });
		expect(statusLine(c, 'tableTalk', NOW)).toBeNull();
	});

	it('an open floor names who has not answered; the clock counts from the end of the last minute', () => {
		const open = v2({
			spokenUids: ['dana', 'omri'],
			speakerUid: 'omri',
			speakerEndsAt: NOW - 30_000,
			updatedAt: NOW - 200_000,
		});
		expect(statusLine(open, 'tableTalk', NOW)).toEqual({
			key: 'console.not_answered',
			nameUids: ['noa', 'lior'],
			elapsedMs: 30_000,
		});
	});

	it('the minute that ran out counts as answered without a write', () => {
		const t = v2({ spokenUids: [], speakerUid: 'dana', speakerEndsAt: NOW - 1 });
		expect(statusLine(t, 'tableTalk', NOW)?.nameUids).toEqual(['noa', 'omri', 'lior']);
	});

	it('Done counts who asked and who passed', () => {
		const done = v2({ askedUids: ['noa', 'dana', 'omri'], passedAskingUids: ['lior'] });
		expect(statusLine(done, 'tableTalk', NOW)).toEqual({
			key: 'console.asked_passed',
			params: { a: 3, p: 1 },
		});
		const none = table({ passedAskingUids: ['dana', 'noa', 'omri', 'lior'] });
		expect(statusLine(none, 'tableTalk', NOW)?.params).toEqual({ a: 0, p: 4 });
	});

	it('says nothing outside Table talk', () => {
		expect(statusLine(table(), 'proposals', NOW)).toBeNull();
		expect(statusLine(table(), 'plenum', NOW)).toBeNull();
	});
});

describe('askedPassedCounts', () => {
	it('does not count leavers, and a student who asked then passed counts once', () => {
		const t = table({ askedUids: ['dana', 'gone'], passedAskingUids: ['dana', 'lior', 'gone2'] });
		expect(askedPassedCounts(t)).toEqual({ a: 1, p: 1 });
	});
});

describe('askMark', () => {
	const running = table({
		step: 'talk',
		askerUid: 'noa',
		questionId: 'q',
		askedUids: ['dana', 'noa'],
		passedAskingUids: ['lior'],
		turn: 2,
		spokenUids: ['noa'],
	});

	it('✓ asked, ? the asker while the turn runs, – passed asking', () => {
		expect(askMark(running, 'dana', NOW)).toBe('✓');
		expect(askMark(running, 'noa', NOW)).toBe('?');
		expect(askMark(running, 'lior', NOW)).toBe('–');
		expect(askMark(running, 'omri', NOW)).toBe('');
	});

	it('the ? turns into a ✓ when everyone answered', () => {
		const over = { ...running, spokenUids: ['noa', 'dana', 'omri', 'lior'] };
		expect(askMark(over, 'noa', NOW)).toBe('✓');
	});
});

describe('answerMark', () => {
	const running = table({
		step: 'talk',
		askerUid: 'noa',
		questionId: 'q',
		askedUids: ['noa'],
		spokenUids: ['dana', 'omri'],
		passedSpeakingUids: ['omri'],
		speakerUid: 'lior',
		speakerEndsAt: NOW + 20_000,
	});

	it('● answering now, ✓ answered, – passed this question', () => {
		expect(answerMark(running, 'lior', NOW)).toBe('●');
		expect(answerMark(running, 'dana', NOW)).toBe('✓');
		expect(answerMark(running, 'omri', NOW)).toBe('–');
		expect(answerMark(running, 'noa', NOW)).toBe('');
	});

	it('clears at the next pick and before any question', () => {
		const over = {
			...running,
			spokenUids: ['dana', 'omri', 'noa', 'lior'],
			speakerEndsAt: NOW - 1,
		};
		expect(answerMark(over, 'dana', NOW)).toBe('');
		expect(answerMark(table(), 'dana', NOW)).toBe('');
	});
});

describe('tableIsDone', () => {
	it('is done only at Table talk, when everyone asked or passed and the talk is over', () => {
		const done = v2({ askedUids: ['noa', 'dana', 'omri'], passedAskingUids: ['lior'] });
		expect(tableIsDone(done, 'tableTalk', NOW)).toBe(true);
		expect(tableIsDone(done, 'proposals', NOW)).toBe(false);
		expect(tableIsDone(v2(), 'tableTalk', NOW)).toBe(false);
	});
});

describe('joinNames', () => {
	it('uses the language\'s own "or"', () => {
		expect(joinNames(['Noa'], 'en')).toBe('Noa');
		expect(joinNames(['Noa', 'Omri', 'Lior'], 'en')).toBe('Noa, Omri, or Lior');
		expect(joinNames(['נועה', 'עומרי', 'ליאור'], 'he')).toContain('או');
	});
});
