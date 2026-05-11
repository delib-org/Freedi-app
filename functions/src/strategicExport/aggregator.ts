/**
 * Strategic export — pool evaluations across cluster members, dedupe by
 * userId, recompute consensus metrics. Reuses condensation/aggregation.
 */

import type { Evaluation, EvaluationAggregate } from '@freedi/shared-types';
import {
	calcAgreement,
	calcAgreementIndex,
	calcLikeMindedness,
	calcMeanSentiment,
} from '@freedi/shared-types';
import {
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
} from '../condensation/aggregation';

/**
 * Pool evaluations from a list of statementIds (cluster members), dedupe by
 * evaluatorId (averaging when one user evaluated multiple members), and
 * compute the standard consensus aggregate.
 *
 * Returns null when no evaluations exist for the pool.
 */
export async function aggregateEvaluationsForMembers(memberStatementIds: string[]): Promise<{
	aggregate: EvaluationAggregate;
	evaluatorIds: string[];
	userAverages: Map<string, number>;
} | null> {
	if (memberStatementIds.length === 0) return null;

	const evaluations = await fetchEvaluationsForIds(memberStatementIds);
	if (evaluations.length === 0) return null;

	const { evaluation, byUser, perUserAverages } = computeClusterEvaluationFromRawEvals(evaluations);
	if (evaluation.numberOfEvaluators === 0) return null;

	return {
		aggregate: toEvaluationAggregate(evaluation),
		evaluatorIds: Array.from(byUser.keys()),
		userAverages: perUserAverages,
	};
}

/**
 * Slice the per-user averages by a subset of evaluator IDs (e.g. those who
 * answered "yes" to a demographic question), then recompute the aggregate
 * statistics from those values directly. This avoids a second Firestore
 * round-trip per slice.
 */
export function aggregateFromUserAverages(
	userAverages: Map<string, number>,
	evaluatorIds: string[],
): EvaluationAggregate | null {
	const values: number[] = [];
	for (const id of evaluatorIds) {
		const v = userAverages.get(id);
		if (typeof v === 'number') values.push(v);
	}
	if (values.length === 0) return null;

	let sum = 0;
	let sumSq = 0;
	let pro = 0;
	let con = 0;
	for (const v of values) {
		sum += v;
		sumSq += v * v;
		if (v > 0) pro++;
		else if (v < 0) con++;
	}

	return {
		C_p: calcAgreement(sum, sumSq, values.length),
		A_p: calcAgreementIndex(sum, sumSq, values.length),
		L_p: calcLikeMindedness(sum, sumSq, values.length),
		avg: calcMeanSentiment(sum, values.length),
		totalEvaluators: values.length,
		pro,
		con,
	};
}

function toEvaluationAggregate(se: {
	agreement: number;
	agreementIndex?: number;
	likeMindedness?: number;
	averageEvaluation?: number;
	numberOfEvaluators: number;
	numberOfProEvaluators?: number;
	numberOfConEvaluators?: number;
}): EvaluationAggregate {
	return {
		C_p: se.agreement,
		A_p: se.agreementIndex ?? 0,
		L_p: se.likeMindedness ?? 0,
		avg: se.averageEvaluation ?? 0,
		totalEvaluators: se.numberOfEvaluators,
		pro: se.numberOfProEvaluators ?? 0,
		con: se.numberOfConEvaluators ?? 0,
	};
}

export { fetchEvaluationsForIds };
export type { Evaluation };
