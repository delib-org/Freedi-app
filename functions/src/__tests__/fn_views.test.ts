import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Collections, StatementType } from '@freedi/shared-types';
import { createFakeDb } from '../progress/__tests__/fakeDb';
import type { FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('../index', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { updateStatementWithViews } from '../fn_views';

const QUESTION = 'question-1';
const OPTION = 'option-1';

const viewEvent = (statementId: string, userId: string) => ({
	params: { viewId: `${userId}--${statementId}` },
	data: { data: () => ({ statementId, userId }) },
});

const statementDoc = (id: string) => fake.read(Collections.statements, id);
const progressDoc = (id: string) => fake.read(Collections.questionProgress, id);

describe('updateStatementWithViews', () => {
	beforeEach(() => {
		fake = createFakeDb();
		fake.seed(Collections.statements, QUESTION, {
			statementId: QUESTION,
			statementType: StatementType.question,
			topParentId: QUESTION,
			viewed: { individualViews: 7 },
			lastUpdate: 111,
		});
		fake.seed(Collections.statements, OPTION, {
			statementId: OPTION,
			statementType: StatementType.option,
			topParentId: QUESTION,
		});
	});

	it('counts a person entering a question on the progress doc, not the question', async () => {
		await updateStatementWithViews(viewEvent(QUESTION, 'alice'));
		await updateStatementWithViews(viewEvent(QUESTION, 'bob'));

		expect(progressDoc(QUESTION)?.entered).toBe(2);
		expect(statementDoc(QUESTION)).toMatchObject({
			viewed: { individualViews: 7 },
			lastUpdate: 111,
		});
	});

	it('does not count the same person twice', async () => {
		await updateStatementWithViews(viewEvent(QUESTION, 'alice'));
		await updateStatementWithViews(viewEvent(QUESTION, 'alice'));

		expect(progressDoc(QUESTION)?.entered).toBe(1);
	});

	it('still counts views on statements that are not questions', async () => {
		await updateStatementWithViews(viewEvent(OPTION, 'alice'));
		await updateStatementWithViews(viewEvent(OPTION, 'bob'));

		expect(statementDoc(OPTION)?.viewed).toEqual({ individualViews: 2 });
		expect(progressDoc(OPTION)).toBeUndefined();
	});

	it('leaves everything alone when the statement is missing', async () => {
		await updateStatementWithViews(viewEvent('missing', 'alice'));

		expect(progressDoc('missing')).toBeUndefined();
	});
});
