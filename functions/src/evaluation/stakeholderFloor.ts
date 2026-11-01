/**
 * The N stored on an option next to its score.
 *
 * `declaredN` is whatever `resolveStakeholderCount` returned: a number an admin
 * typed, or undefined when nobody declared one (open population). Nothing is
 * inferred. A declared N can still be smaller than the people who actually
 * voted, so the evaluator count is a floor — otherwise the strip renders
 * "55 / 40" and the finite-population correction leaves its valid range.
 *
 * Returns undefined when there is no declared N, which callers translate into
 * the uncorrected formula and a removed `evaluation.stakeholderCount`.
 */
export function floorStakeholderCount(
	declaredN: number | undefined,
	numberOfEvaluators: number,
): number | undefined {
	if (declaredN === undefined) return undefined;

	return Math.max(declaredN, numberOfEvaluators);
}
