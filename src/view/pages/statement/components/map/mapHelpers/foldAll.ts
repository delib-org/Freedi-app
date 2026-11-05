import type { Results } from '@freedi/shared-types';

/** What a bulk fold/open touches: ids to open and ids to fold. */
export interface FoldChange {
	open: readonly string[];
	fold: readonly string[];
}

export interface FoldOverrideSets {
	expanded: ReadonlySet<string>;
	folded: ReadonlySet<string>;
}

/**
 * Ids of every node that has children to fold, grouped by tree depth
 * (the question's direct children are level 1). The root is never foldable.
 * Index 0 is unused so that `byLevel[2]` reads as "level 2".
 */
export function foldableIdsByLevel(results: Results): string[][] {
	const byLevel: string[][] = [[]];

	function walk(node: Results, depth: number): void {
		if (depth > 0 && node.sub.length > 0) {
			while (byLevel.length <= depth) byLevel.push([]);
			byLevel[depth].push(node.top.statementId);
		}
		for (const child of node.sub) walk(child, depth + 1);
	}

	walk(results, 0);

	return byLevel;
}

/** The deepest level that has anything to fold (0 when the map has no branches). */
export function deepestFoldableLevel(byLevel: string[][]): number {
	for (let level = byLevel.length - 1; level > 0; level -= 1) {
		if (byLevel[level].length > 0) return level;
	}

	return 0;
}

/** Every foldable node at every level. */
export function allFoldableIds(byLevel: string[][]): string[] {
	return byLevel.flat();
}

/** Fold every node, or open every node. */
export function changeForAll(byLevel: string[][], action: 'fold' | 'open'): FoldChange {
	const ids = allFoldableIds(byLevel);

	return action === 'fold' ? { open: [], fold: ids } : { open: ids, fold: [] };
}

/** Fold or open only the nodes at one level. */
export function changeForLevel(
	byLevel: string[][],
	level: number,
	action: 'fold' | 'open',
): FoldChange {
	const ids = byLevel[level] ?? [];

	return action === 'fold' ? { open: [], fold: ids } : { open: ids, fold: [] };
}

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size !== b.size) return false;
	for (const id of a) if (!b.has(id)) return false;

	return true;
}

/**
 * Apply a change to the hand overrides. A node carries at most one override.
 * Returns the original set objects when nothing changed, so React skips the render.
 */
export function applyFoldChange(current: FoldOverrideSets, change: FoldChange): FoldOverrideSets {
	const expanded = new Set(current.expanded);
	const folded = new Set(current.folded);
	for (const id of change.open) {
		expanded.add(id);
		folded.delete(id);
	}
	for (const id of change.fold) {
		folded.add(id);
		expanded.delete(id);
	}

	return {
		expanded: sameMembers(expanded, current.expanded) ? current.expanded : expanded,
		folded: sameMembers(folded, current.folded) ? current.folded : folded,
	};
}
