import { Statement, StatementType } from '@freedi/shared-types';

const createStatementMock = jest.fn();
const setStatementToDBMock = jest.fn();
const subscribeAuthorToAnswer = jest.fn();
const announceAnswerPublished = jest.fn();

jest.mock('@/controllers/db/statements/setStatements', () => ({
	createStatement: (...a: unknown[]) => createStatementMock(...a),
	setStatementToDB: (...a: unknown[]) => setStatementToDBMock(...a),
	resultsSettingsDefault: {},
	updateStatement: jest.fn(),
}));
jest.mock('@/controllers/db/evaluation/getEvaluation', () => ({ getEvaluations: jest.fn() }));
jest.mock('@/controllers/db/vote/getVotes', () => ({ getVoters: jest.fn() }));
jest.mock('@/controllers/db/subscriptions/subscribeAuthorToAnswer', () => ({
	subscribeAuthorToAnswer: (...a: unknown[]) => subscribeAuthorToAnswer(...a),
}));
jest.mock('@/controllers/db/subscriptions/answerPublished', () => ({
	announceAnswerPublished: (...a: unknown[]) => announceAnswerPublished(...a),
}));
jest.mock('@/redux/store', () => ({ store: { dispatch: jest.fn(), getState: jest.fn() } }));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: (s: unknown) => ({ type: 'statements/setStatement', payload: s }),
}));

import { createStatementFromModal } from '../statementSettingsCont';

const question = {
	statementId: 'q1',
	statement: 'Q',
	statementType: StatementType.question,
} as Statement;
const creator = { uid: 'u1', displayName: 'U', email: '', photoURL: '' };

describe('createStatementFromModal (legacy modal)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createStatementMock.mockImplementation(
			({ statementType }: { statementType: StatementType }) => ({
				statementId: 'n1',
				statementType,
				parentId: 'q1',
			}),
		);
		setStatementToDBMock.mockResolvedValue({ statementId: 'n1' });
	});

	it('an option writes the author subscription and raises the prompt', async () => {
		await createStatementFromModal({
			title: 'Bike lanes',
			creator,
			isOptionSelected: true,
			parentStatement: question,
			statementType: StatementType.option,
		});
		expect(subscribeAuthorToAnswer).toHaveBeenCalledWith(
			expect.objectContaining({ statementId: 'n1' }),
			creator,
		);
		expect(announceAnswerPublished).toHaveBeenCalledWith(expect.anything(), 'n1', question);
	});

	it('a silently failed write announces nothing', async () => {
		setStatementToDBMock.mockResolvedValue(undefined);
		await createStatementFromModal({
			title: 'Bike lanes',
			creator,
			isOptionSelected: true,
			parentStatement: question,
			statementType: StatementType.option,
		});
		expect(subscribeAuthorToAnswer).not.toHaveBeenCalled();
		expect(announceAnswerPublished).not.toHaveBeenCalled();
	});

	it('choosing a question or a group raises nothing', async () => {
		await createStatementFromModal({
			title: 'Sub question',
			creator,
			isOptionSelected: false,
			parentStatement: question,
			statementType: StatementType.question,
		});
		expect(subscribeAuthorToAnswer).not.toHaveBeenCalled();
		expect(announceAnswerPublished).not.toHaveBeenCalled();
	});
});
