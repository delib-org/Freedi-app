import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { everyoneAsked, memberMark, quickActionFor, statusLine } from '../tableTurnConsole';
import { joinNames } from '../listNames';

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--3',
		mainId: 'm',
		n: 3,
		memberUids: ['dana', 'noa', 'omri', 'lior'],
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

describe('quickActionFor (one next-step button, UX 16.E)', () => {
	it('pick: nothing until a question is chosen, then talk', () => {
		expect(quickActionFor(table(), 'tableTalk')).toBeNull();
		expect(quickActionFor(table({ questionId: 'q' }), 'tableTalk')).toEqual({ kind: 'talk' });
	});

	it('talk -> write, write -> rate', () => {
		expect(quickActionFor(table({ step: 'talk' }), 'tableTalk')).toEqual({ kind: 'write' });
		expect(quickActionFor(table({ step: 'write' }), 'tableTalk')).toEqual({ kind: 'rate' });
	});

	it('rate with students left: start the next turn (turn + 1)', () => {
		expect(quickActionFor(table({ step: 'rate', turn: 1 }), 'tableTalk')).toEqual({
			kind: 'turn',
			n: 2,
		});
		const one = table({ step: 'rate', askerUid: 'omri', askedUids: ['dana', 'noa'], turn: 3 });
		expect(quickActionFor(one, 'tableTalk')).toEqual({ kind: 'turn', n: 4 });
	});

	it('rate with everyone asked: no button', () => {
		const all = table({
			step: 'rate',
			askerUid: 'lior',
			askedUids: ['dana', 'noa', 'omri'],
			turn: 4,
		});
		expect(quickActionFor(all, 'tableTalk')).toBeNull();
	});

	it('proposals walk talk -> write -> rate; the plenum only rates', () => {
		expect(quickActionFor(table({ step: 'talk' }), 'proposals')).toEqual({ kind: 'write' });
		expect(quickActionFor(table({ step: 'write' }), 'proposals')).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'proposals')).toBeNull();
		expect(quickActionFor(table({ step: 'write' }), 'plenum')).toEqual({ kind: 'rate' });
		expect(quickActionFor(table({ step: 'rate' }), 'plenum')).toBeNull();
	});
});

describe('statusLine (who the table waits for)', () => {
	const answers = (by: string[]): Statement[] =>
		by.map(
			(uid) =>
				({
					statementId: `a-${uid}`,
					parentId: 'q',
					creatorId: uid,
					classTable: { tableId: 'm--3', shared: false, coAuthors: [] },
				}) as unknown as Statement,
		);

	it('pick and talk-without-speaker wait for the asker', () => {
		expect(statusLine(table(), 'tableTalk', [])).toEqual({
			key: 'console.waiting_for',
			nameUids: ['dana'],
		});
		expect(statusLine(table({ step: 'talk' }), 'tableTalk', [])?.key).toBe('console.waiting_for');
		expect(statusLine(table({ step: 'talk', speakerUid: 'noa' }), 'tableTalk', [])).toBeNull();
	});

	it('write shows how many sent', () => {
		const t = table({ step: 'write', questionId: 'q' });
		expect(statusLine(t, 'tableTalk', answers(['dana', 'noa', 'omri']))).toEqual({
			key: 'turn.sent_count',
			params: { n: 3, m: 4 },
		});
	});

	it('rate names who has not asked, then who is next, then that all have', () => {
		const several = statusLine(table({ step: 'rate' }), 'tableTalk', []);
		expect(several).toEqual({ key: 'console.not_asked', nameUids: ['noa', 'omri', 'lior'] });
		const one = table({ step: 'rate', askerUid: 'omri', askedUids: ['dana', 'noa'], turn: 3 });
		expect(statusLine(one, 'tableTalk', [])).toEqual({
			key: 'console.next_asker',
			nameUids: ['lior'],
		});
		const all = table({
			step: 'rate',
			askerUid: 'lior',
			askedUids: ['dana', 'noa', 'omri'],
			turn: 4,
			questionId: 'q',
		});
		expect(statusLine(all, 'tableTalk', answers(['dana', 'noa', 'omri', 'lior']))).toMatchObject({
			key: 'turn.sent_count',
			params: { n: 4, m: 4 },
		});
	});

	it('says nothing outside Table talk', () => {
		expect(statusLine(table(), 'proposals', [])).toBeNull();
		expect(statusLine(table(), 'plenum', [])).toBeNull();
	});
});

describe('memberMark + everyoneAsked', () => {
	it('marks the asked with a check and the asker with a question mark until rate', () => {
		const t = table({ askerUid: 'noa', askedUids: ['dana'], turn: 2 });
		expect(memberMark(t, 'dana')).toBe('✓');
		expect(memberMark(t, 'noa')).toBe('?');
		expect(memberMark(t, 'omri')).toBe('');
		expect(memberMark({ ...t, step: 'rate' }, 'noa')).toBe('✓');
	});

	it('everyoneAsked only at the last rate of Table talk', () => {
		const all = table({ step: 'rate', askerUid: 'lior', askedUids: ['dana', 'noa', 'omri'] });
		expect(everyoneAsked(all, 'tableTalk')).toBe(true);
		expect(everyoneAsked(all, 'proposals')).toBe(false);
		expect(everyoneAsked({ ...all, step: 'write' }, 'tableTalk')).toBe(false);
		expect(everyoneAsked(table({ step: 'rate' }), 'tableTalk')).toBe(false);
	});
});

describe('joinNames', () => {
	it('uses the language\'s own "or"', () => {
		expect(joinNames(['Noa'], 'en')).toBe('Noa');
		expect(joinNames(['Noa', 'Omri', 'Lior'], 'en')).toBe('Noa, Omri, or Lior');
		expect(joinNames(['נועה', 'עומרי', 'ליאור'], 'he')).toContain('או');
	});
});
