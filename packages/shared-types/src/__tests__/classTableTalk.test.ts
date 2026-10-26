import {
	allowOwnQuestionsOf,
	choosing,
	noQuestionsLeft,
	tableDone,
} from '../models/classroom/classroomLogic';
import type { ClassTable } from '../models/classroom/classroomModel';

const NOW = 1_000_000;

function table(patch: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: NOW,
		...patch,
	};
}

describe('allowOwnQuestionsOf', () => {
	it('is on when the setting is absent', () => {
		expect(allowOwnQuestionsOf(null)).toBe(true);
		expect(allowOwnQuestionsOf({})).toBe(true);
		expect(allowOwnQuestionsOf({ statementSettings: {} })).toBe(true);
	});

	it('follows an explicit value', () => {
		expect(allowOwnQuestionsOf({ statementSettings: { allowOwnQuestions: false } })).toBe(false);
		expect(allowOwnQuestionsOf({ statementSettings: { allowOwnQuestions: true } })).toBe(true);
	});
});

describe('noQuestionsLeft', () => {
	it('never applies while own questions are allowed', () => {
		expect(noQuestionsLeft(table(), [], true)).toBe(false);
	});

	it('is true when own questions are off and every teacher question was used', () => {
		expect(noQuestionsLeft(table({ usedQuestionIds: ['q1', 'q2'] }), ['q1', 'q2'], false)).toBe(
			true,
		);
	});

	it('is true when own questions are off and there are no teacher questions', () => {
		expect(noQuestionsLeft(table(), [], false)).toBe(true);
	});

	it('is false while a teacher question is unused', () => {
		expect(noQuestionsLeft(table({ usedQuestionIds: ['q1'] }), ['q1', 'q2'], false)).toBe(false);
	});
});

describe('tableDone with no question left', () => {
	it('is not done by default while tablemates have not asked', () => {
		expect(tableDone(table(), NOW)).toBe(false);
	});

	it('is done at pick once no question is left and nobody is asking', () => {
		expect(tableDone(table(), NOW, true)).toBe(true);
		expect(choosing(table(), NOW, true)).toBe(false);
	});

	it('waits while the last question is being talked about', () => {
		const midTalk = table({ step: 'talk', askerUid: 'a', questionId: 'q1', askedUids: ['a'] });

		expect(tableDone(midTalk, NOW, true)).toBe(false);
	});

	it('is done once the last talk is over', () => {
		const over = table({
			step: 'talk',
			askerUid: 'a',
			questionId: 'q1',
			askedUids: ['a'],
			spokenUids: ['a', 'b', 'c'],
		});

		expect(tableDone(over, NOW, true)).toBe(true);
	});
});
