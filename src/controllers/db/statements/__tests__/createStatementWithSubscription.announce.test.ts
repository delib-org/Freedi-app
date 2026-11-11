import { QuestionType, Statement, StatementType } from '@freedi/shared-types';

const createStatementMock = jest.fn();
const setStatementToDBMock = jest.fn();

jest.mock('../setStatements', () => ({
	createStatement: (...a: unknown[]) => createStatementMock(...a),
	setStatementToDB: (...a: unknown[]) => setStatementToDBMock(...a),
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	deleteStatement: (id: string) => ({ type: 'statements/deleteStatement', payload: id }),
	setStatement: (s: unknown) => ({ type: 'statements/setStatement', payload: s }),
	setStatementSubscription: (s: unknown) => ({ type: 'statements/setSubscription', payload: s }),
}));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	setStatementSubscriptionToDB: jest.fn(async () => undefined),
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: { getPushSubscriptionFields: () => ({ getPushNotification: false }) },
}));
jest.mock('@/controllers/general/helpers', () => ({
	validateStatementTypeHierarchy: () => ({ allowed: true }),
}));
jest.mock('@/controllers/db/researchLogs/researchLogger', () => ({
	logStatementCreation: jest.fn(),
}));

import { createStatementWithSubscription } from '../createStatementWithSubscription';

const question = {
	statementId: 'q1',
	statement: 'Q',
	statementType: StatementType.question,
} as Statement;
const user = { uid: 'u1', displayName: 'U', email: '', photoURL: '' };

const published = (dispatch: jest.Mock) =>
	dispatch.mock.calls
		.map(([action]) => action)
		.filter((a: { type: string }) => a.type === 'answerNotifyPrompt/answerPublished');

async function create(
	statementType: StatementType,
	parent: Statement | 'top',
	extra: { announceAnswer?: boolean } = {},
) {
	const dispatch = jest.fn();
	await createStatementWithSubscription({
		newStatementParent: parent,
		title: 'Bike lanes',
		newStatement: { statementType },
		newStatementQuestionType: QuestionType.simple,
		currentLanguage: 'en',
		user,
		dispatch,
		...extra,
	});

	return dispatch;
}

describe('createStatementWithSubscription announces a published answer', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createStatementMock.mockImplementation(() => ({
			statementId: 'a1',
			statement: 'Bike lanes',
			parentId: 'q1',
			statementType: StatementType.option,
		}));
		setStatementToDBMock.mockResolvedValue({ statementId: 'a1' });
	});

	it('an option under a question raises the prompt with both ids', async () => {
		const dispatch = await create(StatementType.option, question);
		expect(published(dispatch)).toEqual([
			{
				type: 'answerNotifyPrompt/answerPublished',
				payload: { questionId: 'q1', answerId: 'a1' },
			},
		]);
	});

	it('does not announce a bulk-add (announceAnswer: false)', async () => {
		const dispatch = await create(StatementType.option, question, { announceAnswer: false });
		expect(published(dispatch)).toHaveLength(0);
	});

	it('does not announce a question, or an option whose parent is not a question', async () => {
		expect(published(await create(StatementType.question, question))).toHaveLength(0);
		const group = { ...question, statementType: StatementType.group } as Statement;
		expect(published(await create(StatementType.option, group))).toHaveLength(0);
		expect(published(await create(StatementType.option, 'top'))).toHaveLength(0);
	});

	it('does not announce when the write failed', async () => {
		setStatementToDBMock.mockResolvedValue(undefined);
		const dispatch = jest.fn();
		await expect(
			createStatementWithSubscription({
				newStatementParent: question,
				title: 'x',
				newStatement: { statementType: StatementType.option },
				newStatementQuestionType: QuestionType.simple,
				currentLanguage: 'en',
				user,
				dispatch,
			}),
		).rejects.toThrow();
		expect(published(dispatch)).toHaveLength(0);
	});
});
