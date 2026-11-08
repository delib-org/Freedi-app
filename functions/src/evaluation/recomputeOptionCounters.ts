import { calcAgreement, calcAgreementIndex } from '@freedi/shared-types';
import type { Evaluation, StatementEvaluation } from '@freedi/shared-types';
import { clampEvaluationValue } from './evaluationTypes';

/**
 * Pure recomputation of an option's evaluation counters from its evaluation
 * documents. Shared by the recalculation callable, the migration and the repair
 * script so every tool writes the same numbers as the live trigger.
 *
 * The rule, which the live trigger (statementEvaluationUpdater) already
 * follows: EVERY evaluation document is a participant. A neutral vote (0)
 * counts toward `numberOfEvaluators` and sits in the mean's denominator; it
 * just adds nothing to the pro or con tallies. Counting only non-zero votes
 * pulls the counter down by the number of neutral voters and inflates the mean.
 *
 * `populationSize` is the question's explicit, admin-declared N (or undefined
 * for an open population). It is the 4th argument of both agreement formulas
 * and, when defined, is snapshotted as `stakeholderCount = max(N, n)`.
 */
export interface OptionCounters {
	numberOfEvaluators: number;
	numberOfProEvaluators: number;
	numberOfConEvaluators: number;
	sumEvaluations: number;
	sumSquaredEvaluations: number;
	sumPro: number;
	sumCon: number;
	averageEvaluation: number;
	agreement: number;
	agreementIndex: number;
	/** Present only when an explicit N was given */
	stakeholderCount?: number;
}

export function recomputeOptionCounters(
	evals: Pick<Evaluation, 'evaluation'>[],
	populationSize?: number,
): OptionCounters {
	let numberOfProEvaluators = 0;
	let numberOfConEvaluators = 0;
	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;

	for (const e of evals) {
		const v = clampEvaluationValue(e.evaluation);
		if (v > 0) {
			numberOfProEvaluators++;
			sumPro += v;
		} else if (v < 0) {
			numberOfConEvaluators++;
			sumCon += Math.abs(v);
		}
		sumEvaluations += v;
		sumSquaredEvaluations += v * v;
	}

	const n = evals.length;
	const counters: OptionCounters = {
		numberOfEvaluators: n,
		numberOfProEvaluators,
		numberOfConEvaluators,
		sumEvaluations,
		sumSquaredEvaluations,
		sumPro,
		sumCon,
		averageEvaluation: n > 0 ? sumEvaluations / n : 0,
		agreement: calcAgreement(sumEvaluations, sumSquaredEvaluations, n, populationSize),
		agreementIndex: calcAgreementIndex(sumEvaluations, sumSquaredEvaluations, n, populationSize),
	};
	if (populationSize !== undefined) {
		counters.stakeholderCount = Math.max(populationSize, n);
	}

	return counters;
}

/**
 * True when the stored evaluation disagrees with the recomputed counters on
 * anything a recalculation is responsible for: the three counts, or the
 * stakeholder snapshot (a stale one — from a removed or changed N — must go).
 */
export function hasCounterMismatch(
	stored: Partial<StatementEvaluation> | undefined,
	computed: OptionCounters,
): boolean {
	return (
		(stored?.numberOfEvaluators ?? 0) !== computed.numberOfEvaluators ||
		(stored?.numberOfProEvaluators ?? 0) !== computed.numberOfProEvaluators ||
		(stored?.numberOfConEvaluators ?? 0) !== computed.numberOfConEvaluators ||
		stored?.stakeholderCount !== computed.stakeholderCount
	);
}
