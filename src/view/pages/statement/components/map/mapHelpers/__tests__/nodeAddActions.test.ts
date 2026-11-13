import { StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { resolveNodeAddActions } from '../nodeAddActions';

const mockChild = jest.fn();
const mockSibling = jest.fn();

jest.mock('../mindMapStatements', () => ({
	...jest.requireActual('../mindMapStatements'),
	createMindMapChild: (...args: unknown[]) => mockChild(...args),
	createMindMapSibling: (...args: unknown[]) => mockSibling(...args),
}));

const t = (key: string): string => `t:${key}`;

function make(statementType: StatementType): Statement {
	return { statementId: 's1', statementType, parentId: 'p' } as Statement;
}

describe('resolveNodeAddActions', () => {
	beforeEach(() => jest.clearAllMocks());

	it('offers both when the node can have children and has a parent', () => {
		const actions = resolveNodeAddActions(
			make(StatementType.question),
			make(StatementType.question),
			t,
		);

		expect(actions.child?.label).toMatch(/^t:/);
		expect(actions.sibling?.label).toMatch(/^t:/);
	});

	it('offers no sibling for a root (no parent in the tree)', () => {
		const actions = resolveNodeAddActions(make(StatementType.question), null, t);

		expect(actions.sibling).toBeUndefined();
	});

	it('runs the child creation with the node as parent', async () => {
		const node = make(StatementType.question);
		mockChild.mockResolvedValue({ statementId: 'new' });
		const actions = resolveNodeAddActions(node, null, t);

		await expect(actions.child?.run()).resolves.toEqual({ statementId: 'new' });
		expect(mockChild).toHaveBeenCalledWith(expect.objectContaining({ parentStatement: node }));
	});

	describe('sub-question', () => {
		function question(enable?: boolean): Statement {
			return {
				statementId: 'q1',
				statementType: StatementType.question,
				parentId: 'p',
				statementSettings: { enableAddNewSubQuestionsButton: enable },
			} as Statement;
		}

		it('is offered on a question only when the setting is on', () => {
			expect(resolveNodeAddActions(question(true), null, t).subQuestion).toBeDefined();
			expect(resolveNodeAddActions(question(false), null, t).subQuestion).toBeUndefined();
			expect(resolveNodeAddActions(question(undefined), null, t).subQuestion).toBeUndefined();
		});

		it('is offered to an admin unless switched off', () => {
			expect(resolveNodeAddActions(question(undefined), null, t, true).subQuestion).toBeDefined();
			expect(resolveNodeAddActions(question(false), null, t, true).subQuestion).toBeUndefined();
		});

		it('is never offered on non-question nodes', () => {
			const option = { ...make(StatementType.option), statementSettings: {} } as Statement;
			const group = {
				...make(StatementType.group),
				statementSettings: { enableAddNewSubQuestionsButton: true },
			} as Statement;

			expect(resolveNodeAddActions(option, null, t, true).subQuestion).toBeUndefined();
			expect(resolveNodeAddActions(group, null, t, true).subQuestion).toBeUndefined();
		});

		it('creates a question child under the selected question', async () => {
			const node = question(true);
			mockChild.mockResolvedValue({ statementId: 'new' });

			await resolveNodeAddActions(node, null, t).subQuestion?.run();

			expect(mockChild).toHaveBeenCalledWith(
				expect.objectContaining({ parentStatement: node, childType: StatementType.question }),
			);
		});
	});

	it('runs the sibling creation with node and parent', async () => {
		const node = make(StatementType.option);
		const parent = make(StatementType.question);
		mockSibling.mockResolvedValue({ statementId: 'new' });
		const actions = resolveNodeAddActions(node, parent, t);

		await actions.sibling?.run();

		expect(mockSibling).toHaveBeenCalledWith(
			expect.objectContaining({ currentStatement: node, parentStatement: parent }),
		);
	});
});
