import { Statement, StatementType } from '@freedi/shared-types';

const createStatement = jest.fn();
const setStatementToDB = jest.fn();

jest.mock('../createStatement', () => ({
	createStatement: (...a: unknown[]) => createStatement(...a),
}));
jest.mock('../writeStatement', () => ({
	setStatementToDB: (...a: unknown[]) => setStatementToDB(...a),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

import { createImprovedAnswer } from '../createImprovedAnswer';

const parent = {
	statementId: 'q1',
	statement: 'Q',
	membership: { access: 'openToAll' },
} as Statement;
const source = {
	statementId: 'a1',
	statement: 'Two planters',
	parentId: 'q1',
	statementType: StatementType.option,
} as Statement;

describe('createImprovedAnswer', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		createStatement.mockImplementation((input: { text: string }) => ({
			statementId: 'a2',
			statement: input.text,
		}));
		setStatementToDB.mockImplementation(async ({ statement }: { statement: Statement }) => ({
			statementId: statement.statementId,
			statement,
		}));
	});

	it('creates a new answer under the same question with the reason pointing at the source', async () => {
		const saved = await createImprovedAnswer({
			source,
			parent,
			text: ' Two movable planters for one month ',
			reason: 'Maintenance worry',
		});
		expect(saved.statementId).toBe('a2');
		const input = createStatement.mock.calls[0][0];
		expect(input.text).toBe('Two movable planters for one month');
		expect(input.parentStatement).toBe(parent);
		expect(input.statementType).toBe(StatementType.option);
		expect(input.paragraphs).toHaveLength(1);
		expect(input.paragraphs[0]).toMatchObject({
			content: 'Maintenance worry',
			sourceStatementId: 'a1',
			order: 0,
		});
		expect(setStatementToDB).toHaveBeenCalledWith({
			statement: expect.objectContaining({ statementId: 'a2' }),
			parentStatement: parent,
		});
	});

	it('refuses empty wording, an empty reason, and unchanged wording', async () => {
		await expect(
			createImprovedAnswer({ source, parent, text: '  ', reason: 'r' }),
		).rejects.toThrow();
		await expect(
			createImprovedAnswer({ source, parent, text: 'New', reason: ' ' }),
		).rejects.toThrow();
		await expect(
			createImprovedAnswer({ source, parent, text: 'Two planters', reason: 'r' }),
		).rejects.toThrow(/unchanged/);
		expect(createStatement).not.toHaveBeenCalled();
	});

	it('throws when the save fails', async () => {
		setStatementToDB.mockResolvedValueOnce(undefined);
		await expect(
			createImprovedAnswer({ source, parent, text: 'New wording', reason: 'r' }),
		).rejects.toThrow(/save/);
	});
});
