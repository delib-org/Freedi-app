import { Statement } from '@freedi/shared-types';
import { getConsensusScore } from '@/redux/utils/selectorFactories';

/** Best first for a viewer who may see scores; otherwise oldest first, which says nothing. */
export function orderSolutionsForViewer(
	solutions: readonly Statement[],
	canSeeScores: boolean,
): Statement[] {
	return [...solutions].sort((a, b) =>
		canSeeScores ? getConsensusScore(b) - getConsensusScore(a) : a.createdAt - b.createdAt,
	);
}
