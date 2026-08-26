import type { RatingMode, Results, Statement } from '@freedi/shared-types';

/**
 * Which rating scale a mind-map node is evaluated on, and whether evaluation is
 * open at all.
 *
 * Both are inherited: a node has no settings of its own, it takes them from the
 * question it hangs under. The nearest question that states a value wins, so a
 * sub-question can override the top question for its own branch ("local
 * overrides global"). When nobody up the chain states one, the signed
 * agree-disagree scale (-1 … +1) applies — that is the app-wide default.
 */
export interface MapEvaluationSettings {
	ratingMode: RatingMode;
	enableEvaluation: boolean;
}

export const DEFAULT_RATING_MODE: RatingMode = 'agree-disagree';

/**
 * Ancestors of `statementId` in the results tree, nearest first, ending at the
 * tree root. `[]` for the root itself; `null` when the id is not in the tree —
 * the two mean different things to a caller resolving settings.
 */
export function findAncestorChain(results: Results, statementId: string): Statement[] | null {
	if (results.top.statementId === statementId) return [];

	for (const sub of results.sub) {
		const chain = findAncestorChain(sub, statementId);
		if (chain) return [...chain, results.top];
	}

	return null;
}

/**
 * Walk the chain per setting, not per statement: a question that pins the
 * rating mode but says nothing about `enableEvaluation` must not also swallow
 * the top question's answer to the second question.
 */
export function resolveEvaluationSettings(chain: readonly Statement[]): MapEvaluationSettings {
	const ratingMode = chain.find((ancestor) => ancestor.statementSettings?.ratingMode !== undefined)
		?.statementSettings?.ratingMode;

	const enableEvaluation = chain.find(
		(ancestor) => ancestor.statementSettings?.enableEvaluation !== undefined,
	)?.statementSettings?.enableEvaluation;

	return {
		ratingMode: ratingMode ?? DEFAULT_RATING_MODE,
		enableEvaluation: enableEvaluation ?? true,
	};
}
