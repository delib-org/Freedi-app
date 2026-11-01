import { describe, expect, it } from 'vitest';
import { boardEmptyLine, classmateNumber } from '../flows/boardLines';

const base = {
	visible: 0,
	classmates: 0,
	lottery: false,
	live: true,
	hasMine: false,
	canWrite: true,
};

describe('boardEmptyLine', () => {
	it('says nothing when the board shows notes', () => {
		expect(boardEmptyLine({ ...base, visible: 2, classmates: 8 })).toBe(null);
	});

	it('counts the notes the lottery holds back before I write', () => {
		expect(boardEmptyLine({ ...base, lottery: true, classmates: 8 })).toEqual({
			key: 'village.board.write_to_read',
			n: 8,
		});
	});

	it('says "no notes yet" only when none exist', () => {
		expect(boardEmptyLine({ ...base, lottery: true })).toEqual({ key: 'village.board.empty' });
		expect(boardEmptyLine(base)).toEqual({ key: 'village.board.empty' });
	});

	it('never invites the teacher watching, a closed booth, or someone who already wrote', () => {
		const held = { ...base, lottery: true, classmates: 8 };
		expect(boardEmptyLine({ ...held, canWrite: false })).toEqual({ key: 'village.board.empty' });
		expect(boardEmptyLine({ ...held, live: false })).toEqual({ key: 'village.board.empty' });
		expect(boardEmptyLine({ ...held, hasMine: true })).toEqual({ key: 'village.board.empty' });
	});
});

describe('classmateNumber', () => {
	const notes = [
		{ statementId: 'mine', creatorId: 'me' },
		{ statementId: 'a', creatorId: 'x' },
		{ statementId: 'b', creatorId: 'y' },
	];

	it('numbers the first classmate 1, whatever comes before it', () => {
		expect(classmateNumber(notes, 'me', 'a')).toBe(1);
		expect(classmateNumber(notes, 'me', 'b')).toBe(2);
	});

	it('keeps the classmates numbers when my note moves', () => {
		const moved = [notes[1], notes[2], notes[0]];
		expect(classmateNumber(moved, 'me', 'a')).toBe(1);
		expect(classmateNumber(moved, 'me', 'b')).toBe(2);
	});

	it('falls back to 1 for a note not on the board', () => {
		expect(classmateNumber(notes, 'me', 'gone')).toBe(1);
	});
});
