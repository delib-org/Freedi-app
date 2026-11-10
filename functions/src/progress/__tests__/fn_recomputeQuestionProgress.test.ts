import { Collections, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from './fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldPath: { documentId: () => '__name__' },
	FieldValue: { increment: (n: number) => ({ _increment: n }) },
}));
jest.mock('firebase-functions/v1', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const QUESTION = 'question-1';
const statement = {
	statementId: QUESTION,
	statementType: StatementType.question,
	topParentId: QUESTION,
};

jest.mock('../assertStatementAdmin', () => ({
	assertStatementAdmin: jest.fn(async () => ({ statement })),
}));

import { recomputeQuestionProgressForAdmin } from '../fn_recomputeQuestionProgress';

const progress = () => fake.read(Collections.questionProgress, QUESTION);

describe('recomputeQuestionProgressForAdmin', () => {
	beforeEach(() => {
		fake = createFakeDb();
		fake.seed(Collections.statementViews, `ada--${QUESTION}`, {
			statementId: QUESTION,
			userId: 'ada',
		});
	});

	it('keeps the fields it does not rebuild', async () => {
		fake.seed(Collections.questionProgress, QUESTION, {
			statementId: QUESTION,
			entered: 99,
			members: 43,
			chainEvaluated: 12,
			chainKey: 'question-1:12',
			lastActivity: 5,
		});

		await recomputeQuestionProgressForAdmin('admin', QUESTION);

		expect(progress()).toMatchObject({
			entered: 1,
			members: 43,
			chainEvaluated: 12,
			chainKey: 'question-1:12',
			lastActivity: 5,
		});
	});

	it('adds no empty fields to a question that never had them', async () => {
		await recomputeQuestionProgressForAdmin('admin', QUESTION);

		expect(progress()).not.toHaveProperty('members');
		expect(progress()).not.toHaveProperty('chainEvaluated');
		expect(progress()).not.toHaveProperty('chainKey');
	});
});
