import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import {
	askedPassedCounts,
	memberMark,
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

describe('quickActionFor (one next-step button, UX 16.E)', () => {
	it('V1: no button (the sheet gives the turn); A: nothing until a question is chosen, then talk', () => {
		expect(quickActionFor(table(), 'tableTalk', NOW)).toBeNull();
		expect(quickActionFor(table({ askerUid: 'noa' }), 'tableTalk', NOW)).toBeNull();
		expect(quickActionFor(table({ askerUid: 'noa', questionId: 'q' }), 'tableTalk', NOW)).toEqual({
			kind: 'talk',
		});
	});

	it('B / C: no button while the table talks', () => {
		const talking = v2({ spokenUids: ['noa'], speakerUid: 'dana', speakerEndsAt: NOW + 30_000 });
		expect(quickActionFor(talking, 'tableTalk', NOW)).toBeNull();
		expect(quickActionFor(v2({ spokenUids: [] }), 'tableTalk', NOW)).toBeNull();
	});

	it('V2: start the next turn (turn + 1, which opens V1); also with one student left', () => {
		expect(quickActionFor(v2(), 'tableTalk', NOW)).toEqual({ kind: 'turn', n: 2 });
		const one = v2({ turn: 3, askedUids: ['noa', 'dana', 'omri'] });
		expect(quickActionFor(one, 'tableTalk', NOW)).toEqual({ kind: 'turn', n: 4 });
	});

	it('Done: no button; nobody writes or rates at Table talk', () => {
		const done = v2({ askedUids: ['noa', 'dana', 'omri'], passedAskingUids: ['lior'] });
		expect(quickActionFor(done, 'tableTalk', NOW)).toBeNull();
		expect(
			quickActionFor(
				table({ passedAskingUids: ['dana', 'noa', 'omri', 'lior'] }),
				'tableTalk',
				NOW,
			),
		).toBeNull();
	});

	it('proposals walk talk -> write -> rate; the plenum only rates', () => {
		expect(quickActionFor(table({ step: 'talk' }), 'proposals', NOW)).toEqual({ kind: 'write' });
		expect(quickActionFor(table({ step: 'write' }), 'proposals', NOW)).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'proposals', NOW)).toBeNull();
		expect(quickActionFor(table({ step: 'write' }), 'plenum', NOW)).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'plenum', NOW)).toBeNull();
	});
});

describe('statusLine (who the table waits for)', () => {
	it('V1 waits for a volunteer', () => {
		expect(statusLine(table(), 'tableTalk', NOW)).toEqual({ key: 'console.waiting_volunteer' });
	});

	it('A and talk-without-speaker wait for the asker; a running minute says nothing', () => {
		const a = table({ askerUid: 'noa' });
		expect(statusLine(a, 'tableTalk', NOW)).toEqual({
			key: 'console.waiting_for',
			nameUids: ['noa'],
		});
		const b = table({ step: 'talk', askerUid: 'noa', askedUids: ['noa'], questionId: 'q' });
		expect(statusLine(b, 'tableTalk', NOW)?.key).toBe('console.waiting_for');
		const c = { ...b, speakerUid: 'dana', speakerEndsAt: NOW + 5000 };
		expect(statusLine(c, 'tableTalk', NOW)).toBeNull();
	});

	it('V2 names who has not asked, or the one left', () => {
		expect(statusLine(v2(), 'tableTalk', NOW)).toEqual({
			key: 'console.not_asked',
			nameUids: ['dana', 'omri', 'lior'],
		});
		const one = v2({ askedUids: ['noa', 'dana', 'omri'] });
		expect(statusLine(one, 'tableTalk', NOW)).toEqual({
			key: 'console.waiting_for',
			nameUids: ['lior'],
		});
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

describe('memberMark + tableIsDone', () => {
	it('marks asked with a check, passed with a dash, the asker with ? until everyone spoke', () => {
		const t = table({
			step: 'talk',
			askerUid: 'noa',
			askedUids: ['dana', 'noa'],
			passedAskingUids: ['lior'],
			turn: 2,
			spokenUids: ['noa'],
		});
		expect(memberMark(t, 'dana', NOW)).toBe('✓');
		expect(memberMark(t, 'noa', NOW)).toBe('?');
		expect(memberMark(t, 'lior', NOW)).toBe('–');
		expect(memberMark(t, 'omri', NOW)).toBe('');
		expect(memberMark({ ...t, spokenUids: ['noa', 'dana', 'omri', 'lior'] }, 'noa', NOW)).toBe('✓');
		expect(memberMark({ ...t, step: 'pick' }, 'noa', NOW)).toBe('?');
	});

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
