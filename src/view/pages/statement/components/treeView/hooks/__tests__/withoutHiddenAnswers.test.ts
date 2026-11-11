import type { Statement } from '@freedi/shared-types';

jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: jest.fn() }));
jest.mock('@/redux/statements/treeViewSelectors', () => ({
	createTreeViewSelector: jest.fn(),
}));
jest.mock('@/redux/utils/selectorFactories', () => ({ sortByConsensus: jest.fn() }));
jest.mock('@/controllers/hooks/useAnswerVisibility', () => ({ useCanSeeAnswer: jest.fn() }));

import { withoutHiddenAnswers } from '../useTreeData';

const statement = (statementId: string): Statement => ({ statementId }) as unknown as Statement;
const canSee = (candidate: Statement): boolean => candidate.statementId !== 'hidden';

describe('withoutHiddenAnswers', () => {
	const tree = {
		rootChildren: [statement('hidden'), statement('visible')],
		childrenMap: new Map([
			['root', [statement('hidden'), statement('visible')]],
			['visible', [statement('reply'), statement('hidden')]],
		]),
	};

	it('removes what the viewer may not see from the root', () => {
		const ids = withoutHiddenAnswers(tree, canSee).rootChildren.map((s) => s.statementId);

		expect(ids).toEqual(['visible']);
	});

	it('removes it at every depth of the tree', () => {
		const { childrenMap } = withoutHiddenAnswers(tree, canSee);

		expect(childrenMap.get('root')?.map((s) => s.statementId)).toEqual(['visible']);
		expect(childrenMap.get('visible')?.map((s) => s.statementId)).toEqual(['reply']);
	});

	it('does not change the tree it was given', () => {
		withoutHiddenAnswers(tree, canSee);

		expect(tree.rootChildren).toHaveLength(2);
	});
});
