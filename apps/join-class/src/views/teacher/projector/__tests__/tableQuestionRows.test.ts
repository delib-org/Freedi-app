import { describe, expect, it } from 'vitest';
import type { ClassTable } from '@freedi/shared-types';
import { tableQuestionRows } from '../projectorLogic';

const questions = [{ statementId: 'q1', statement: 'What is fair?' }];

function asking(n: number, step: ClassTable['step'], questionId?: string): ClassTable {
	return {
		tableId: `m--${n}`,
		mainId: 'm',
		n,
		memberUids: [],
		noDeviceMembers: [],
		step,
		...(questionId ? { questionId } : {}),
	} as unknown as ClassTable;
}

describe('tableQuestionRows (the question each table is on, on the projector)', () => {
	it('lists the tables past the pick that have a question, in table order', () => {
		const rows = tableQuestionRows(
			[
				asking(2, 'talk', 'q1'),
				asking(1, 'write', 'q1'),
				asking(3, 'pick', 'q1'),
				asking(4, 'talk'),
			],
			questions,
			new Map(),
		);
		expect(rows.map((row) => row.n)).toEqual([1, 2]);
		expect(rows[0].text).toBe('What is fair?');
	});

	it('has no text yet for a question that is not loaded, and takes it from the fetched cache', () => {
		const tables = [asking(1, 'talk', 'own1')];
		expect(tableQuestionRows(tables, questions, new Map())[0].text).toBeNull();
		expect(tableQuestionRows(tables, questions, new Map([['own1', 'Mine']]))[0].text).toBe('Mine');
	});
});
