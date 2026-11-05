import { useCallback, useMemo } from 'react';
import type { Results } from '@freedi/shared-types';
import type { FoldChange } from './foldAll';
import { changeForAll, changeForLevel, deepestFoldableLevel, foldableIdsByLevel } from './foldAll';

export interface FoldControls {
	/** Deepest level with anything to fold; 0 hides the controls. */
	maxLevel: number;
	onCollapseAll: () => void;
	onExpandAll: () => void;
	onCollapseLevel: (level: number) => void;
	onExpandLevel: (level: number) => void;
}

/**
 * Collapse-all / expand-all / per-level folding for both maps. It feeds the
 * shared detail state, so it is one state change and one render per click.
 */
export function useFoldControls(
	results: Results | null | undefined,
	applyFold: (change: FoldChange) => void,
): FoldControls {
	const byLevel = useMemo(() => (results ? foldableIdsByLevel(results) : [[]]), [results]);
	const maxLevel = useMemo(() => deepestFoldableLevel(byLevel), [byLevel]);

	const onCollapseAll = useCallback(
		() => applyFold(changeForAll(byLevel, 'fold')),
		[applyFold, byLevel],
	);
	const onExpandAll = useCallback(
		() => applyFold(changeForAll(byLevel, 'open')),
		[applyFold, byLevel],
	);
	const onCollapseLevel = useCallback(
		(level: number) => applyFold(changeForLevel(byLevel, level, 'fold')),
		[applyFold, byLevel],
	);
	const onExpandLevel = useCallback(
		(level: number) => applyFold(changeForLevel(byLevel, level, 'open')),
		[applyFold, byLevel],
	);

	return { maxLevel, onCollapseAll, onExpandAll, onCollapseLevel, onExpandLevel };
}
