import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement } from '@freedi/shared-types';
import {
	actForModeOf,
	actForStudents,
	firstNotDone,
	isStudentDone,
	nextStudentOf,
	noDeviceNamesById,
	noDeviceTotal,
	proposalActionState,
	voteActionState,
} from '../actFor';
import { groupWrittenTexts, toWrittenText } from '../textsHelpers';

const table = (n: number, names: string[]): ClassTable =>
	({
		n,
		tableId: `m--${n}`,
		noDeviceMembers: names.map((name) => ({ id: `nd_${name}`, name })),
	}) as ClassTable;
const proposal = (extra: Partial<Statement>): Statement =>
	({ statementId: 'p', statement: 'An idea', ...extra }) as Statement;

const tables = [table(2, ['Omer']), table(1, ['Dana', 'Noa'])];

describe('who the sheet is about', () => {
	it('lists students by table, in seating order', () => {
		expect(actForStudents(tables).map((s) => [s.n, s.name])).toEqual([
			[1, 'Dana'],
			[1, 'Noa'],
			[2, 'Omer'],
		]);
	});

	it('counts and names them from the tables, and tolerates a table without the field', () => {
		expect(noDeviceTotal(tables)).toBe(3);
		expect(noDeviceTotal([{} as ClassTable])).toBe(0);
		expect(noDeviceNamesById(tables).get('nd_Noa')).toBe('Noa');
	});
});

describe('what can be done at a step', () => {
	it('proposals at both proposal steps, votes at the vote, nothing elsewhere', () => {
		expect(actForModeOf('proposals')).toBe('proposal');
		expect(actForModeOf('allProposals')).toBe('proposal');
		expect(actForModeOf('vote')).toBe('vote');
		for (const step of ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'summary'] as const) {
			expect(actForModeOf(step)).toBe('none');
		}
	});

	it('a vote only while the ballot is open and the lesson not held', () => {
		expect(voteActionState(null, false)).toBe('not-open');
		expect(voteActionState({}, false)).toBe('open');
		expect(voteActionState({ pausedAt: 1 }, false)).toBe('paused');
		expect(voteActionState({ closedAt: 1 }, false)).toBe('closed');
		expect(voteActionState({ closedAt: 1, pausedAt: 1 }, false)).toBe('closed');
		expect(voteActionState({}, true)).toBe('held');
	});

	it('a proposal only until the ballot freezes, and not while held', () => {
		expect(proposalActionState(undefined, false)).toBe('open');
		expect(proposalActionState({ frozenAt: 1 }, false)).toBe('frozen');
		expect(proposalActionState(undefined, true)).toBe('held');
	});
});

describe('who is done', () => {
	const mine = [proposal({ creatorId: 'nd_Dana' })];

	it('at proposals: holds a proposal. At the vote: has a vote', () => {
		expect(isStudentDone('proposal', 'nd_Dana', mine, null)).toBe(true);
		expect(isStudentDone('proposal', 'nd_Noa', mine, 'p1')).toBe(false);
		expect(isStudentDone('vote', 'nd_Dana', mine, null)).toBe(false);
		expect(isStudentDone('vote', 'nd_Noa', [], 'p1')).toBe(true);
	});

	it('the band opens at the first not done, else the first, else nobody', () => {
		const students = actForStudents(tables);
		expect(firstNotDone(students, (id) => id === 'nd_Dana')?.name).toBe('Noa');
		expect(firstNotDone(students, () => true)?.name).toBe('Dana');
		expect(firstNotDone([], () => false)).toBeNull();
	});

	it('next goes round the list, and is nobody when there is only one', () => {
		const students = actForStudents(tables);
		expect(nextStudentOf(students, 'nd_Dana')?.name).toBe('Noa');
		expect(nextStudentOf(students, 'nd_Omer')?.name).toBe('Dana');
		expect(nextStudentOf(students.slice(0, 1), 'nd_Dana')).toBeNull();
		expect(nextStudentOf(students, 'nd_gone')).toBeNull();
	});
});

describe('what the teacher reads in "what they wrote"', () => {
	const entered = proposal({
		statementId: 'pnd',
		creatorId: 'nd_Noa',
		creator: { uid: 'nd_Noa', displayName: '', photoURL: null, isAnonymous: true },
		classTable: { tableId: 'm--1', shared: false, coAuthors: [], enteredByUid: 'teacher' },
	} as Partial<Statement>);

	it('resolves the name from the tables, and marks what the teacher entered', () => {
		const text = toWrittenText(entered, noDeviceNamesById(tables));
		expect(text.author).toBe('Noa');
		expect(text.enteredByTeacher).toBe(true);
	});

	it('a student who wrote their own carries no mark and keeps their name', () => {
		const own = proposal({
			creatorId: 'dana',
			creator: { uid: 'dana', displayName: 'Dana' },
			classTable: { tableId: 'm--1', shared: false, coAuthors: [] },
		} as Partial<Statement>);
		expect(toWrittenText(own)).toMatchObject({ author: 'Dana', enteredByTeacher: false });
	});

	it('groupWrittenTexts resolves it under the student table', () => {
		const groups = groupWrittenTexts(
			[{ question: proposal({ statementId: 'ch', statement: 'Q' }), challenge: true }],
			new Map([['ch', [entered]]]),
			tables,
		);
		expect(groups[0].groups[0]).toMatchObject({ n: 1 });
		expect(groups[0].groups[0].texts[0]).toMatchObject({ author: 'Noa', enteredByTeacher: true });
	});
});
