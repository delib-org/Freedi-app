import { Statement, calcMeanSentiment } from '@freedi/shared-types';
import { getConsensusScore } from '@/redux/utils/selectorFactories';

/** Never derive opposition counts from rating magnitudes or sort hidden results. */
export function agreementCandidates(options: Statement[], showResults: boolean): Statement[] {
	const unique = [
		...new Map(
			options
				.filter((p) => !p.hide && (!p.isCluster || p.derivedByPipeline === 'synthesis'))
				.map((p) => [p.statementId, p]),
		).values(),
	];

	return unique.sort(
		showResults
			? (a, b) =>
					((b.evaluation?.numberOfEvaluators ?? 0) ? getConsensusScore(b) : -2) -
						((a.evaluation?.numberOfEvaluators ?? 0) ? getConsensusScore(a) : -2) ||
					a.createdAt - b.createdAt
			: (a, b) => a.createdAt - b.createdAt,
	);
}
export function proposalEvidence(p: Statement) {
	const e = p.evaluation;
	const n = e?.numberOfEvaluators ?? 0;
	const sum = e?.sumEvaluations ?? (e?.sumPro ?? 0) - (e?.sumCon ?? 0);

	return {
		n,
		score: n ? getConsensusScore(p) : undefined,
		mean: n ? calcMeanSentiment(sum, n) : undefined,
		support: e?.numberOfProEvaluators,
		oppose: e?.numberOfConEvaluators,
		confidence: e?.confidenceIndex,
	};
}
