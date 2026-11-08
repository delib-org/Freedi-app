export type MapScale = 'absolute' | 'average';

export const MAP_SCALES: MapScale[] = ['absolute', 'average'];

/** Faintest fill a dot can get, so a one-evaluator option is still visible. */
export const MIN_DOT_FILL_OPACITY = 0.15;

export interface DotEvaluation {
	sumPro: number;
	sumCon: number;
	numberOfEvaluators: number;
}

export interface DotPlacement {
	/** Share of the axis, 0..1 (before jitter). */
	pro: number;
	con: number;
	/** Fill opacity, MIN_DOT_FILL_OPACITY..1. Always 1 on the absolute scale. */
	fillOpacity: number;
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;

	return Math.max(0, Math.min(1, value));
}

/**
 * Where a dot sits on the agreement map.
 * - absolute: raw pro/con sums against the most-evaluated option, so an option
 *   many people saw sits further out than a late one.
 * - average: pro/con per evaluator, so a late option is placed by how it was
 *   received; how sure we are of it (its evaluators against the most-evaluated
 *   option) shows as the dot's fill opacity.
 */
export function placeDot(
	{ sumPro, sumCon, numberOfEvaluators }: DotEvaluation,
	maxEvaluators: number,
	scale: MapScale,
): DotPlacement {
	if (scale === 'average') {
		const evaluators = numberOfEvaluators > 0 ? numberOfEvaluators : 1;
		const certainty = maxEvaluators > 0 ? clamp01(numberOfEvaluators / maxEvaluators) : 0;

		return {
			pro: clamp01(sumPro / evaluators),
			con: clamp01(sumCon / evaluators),
			fillOpacity: MIN_DOT_FILL_OPACITY + (1 - MIN_DOT_FILL_OPACITY) * certainty,
		};
	}

	const max = maxEvaluators > 0 ? maxEvaluators : 1;

	return {
		pro: clamp01(sumPro / max),
		con: clamp01(sumCon / max),
		fillOpacity: 1,
	};
}
