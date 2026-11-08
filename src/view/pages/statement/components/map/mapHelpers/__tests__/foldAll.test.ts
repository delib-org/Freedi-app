import type { Results, Statement } from '@freedi/shared-types';
import {
	applyFoldChange,
	changeForAll,
	changeForLevel,
	deepestFoldableLevel,
	foldableIdsByLevel,
} from '../foldAll';
import { applyDetailLevel } from '../detailLevel';

function node(id: string, sub: Results[] = [], isCluster = false): Results {
	return { top: { statementId: id, statement: id, isCluster } as Statement, sub };
}

// root → a (→ a1 (→ a1x), a2), b (leaf), c (→ c1)
const tree = node('root', [
	node('a', [node('a1', [node('a1x')]), node('a2')], true),
	node('b'),
	node('c', [node('c1')], true),
]);

describe('foldAll', () => {
	it('groups foldable ids by depth and skips the root and leaves', () => {
		const byLevel = foldableIdsByLevel(tree);

		expect(byLevel[1]).toEqual(['a', 'c']);
		expect(byLevel[2]).toEqual(['a1']);
		expect(deepestFoldableLevel(byLevel)).toBe(2);
	});

	it('reports level 0 for a map without branches', () => {
		expect(deepestFoldableLevel(foldableIdsByLevel(node('root', [node('x')])))).toBe(0);
	});

	it('collapse all folds every branch and nothing else', () => {
		const change = changeForAll(foldableIdsByLevel(tree), 'fold');

		expect([...change.fold].sort()).toEqual(['a', 'a1', 'c']);
		expect(change.open).toEqual([]);
	});

	it('changes only the nodes at the chosen level', () => {
		const byLevel = foldableIdsByLevel(tree);

		expect(changeForLevel(byLevel, 2, 'open')).toEqual({ open: ['a1'], fold: [] });
		expect(changeForLevel(byLevel, 9, 'fold')).toEqual({ open: [], fold: [] });
	});

	it('moves a node from one override set to the other', () => {
		const current = { expanded: new Set(['a']), folded: new Set(['c']) };
		const next = applyFoldChange(current, { open: ['c'], fold: ['a'] });

		expect([...next.expanded]).toEqual(['c']);
		expect([...next.folded]).toEqual(['a']);
	});

	it('keeps the same set objects when nothing changes', () => {
		const current = { expanded: new Set<string>(), folded: new Set(['a']) };
		const next = applyFoldChange(current, { open: [], fold: ['a'] });

		expect(next.expanded).toBe(current.expanded);
		expect(next.folded).toBe(current.folded);
	});

	it('collapse all then renders every branch folded through applyDetailLevel', () => {
		const change = changeForAll(foldableIdsByLevel(tree), 'fold');
		const detail = applyDetailLevel(tree, 'everything', new Set(), new Set(change.fold));

		expect(detail.sub.filter((child) => child.sub.length > 0).every((c) => c.collapsed)).toBe(true);
	});

	it('expand all opens clusters the level would fold', () => {
		const change = changeForAll(foldableIdsByLevel(tree), 'open');
		const detail = applyDetailLevel(tree, 'themes', new Set(change.open));

		expect(detail.sub[0].collapsed).toBe(false);
		expect(detail.sub[2].collapsed).toBe(false);
	});
});
