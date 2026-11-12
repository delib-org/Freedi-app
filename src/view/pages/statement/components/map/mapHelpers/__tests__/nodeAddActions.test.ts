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
