import { Statement, calcMeanSentiment } from '@freedi/shared-types';
import type { EmergingIdea } from './DecisionBoard';

/** Recent proposals, not a ranking. A theme is navigation and has no pooled stance. */
export function getEmergingIdeas(options: Statement[]): EmergingIdea[] {
	return options
		.filter(
			(option) => !option.hide && (!option.isCluster || option.derivedByPipeline === 'synthesis'),
		)
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((option) => {
			const evaluators = option.evaluation?.numberOfEvaluators ?? 0;
			const sum =
				option.evaluation?.sumEvaluations ??
				(option.evaluation?.sumPro ?? 0) - (option.evaluation?.sumCon ?? 0);

			return {
				id: option.statementId,
				title: option.statement,
				evaluators,
				mean: evaluators ? calcMeanSentiment(sum, evaluators) : undefined,
				synthesisSources:
					option.derivedByPipeline === 'synthesis' ? option.integratedOptions?.length : undefined,
			};
		});
}
