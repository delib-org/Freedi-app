/**
 * Strategic export — embedded schema documentation. The downstream AI agent
 * reads this to understand what each metric means without external docs.
 */

import type { StrategicExportSchema } from '@freedi/shared-types';

export const STRATEGIC_EXPORT_SCHEMA: StrategicExportSchema = {
	'metadata.questionId': 'Statement ID of the deliberation question this export was generated for.',
	'metadata.questionText': 'The text of the deliberation question.',
	'metadata.exportedAt': 'Unix timestamp (ms) when this export was generated.',
	'metadata.consensusThreshold':
		'Minimum consensus (C_p) required to include a suggestion individually before clustering. Suggestions below this threshold are still included if totalEvaluators >= 3 AND avg > 0.6.',
	'metadata.kAnonymity':
		'Minimum number of evaluators in any demographic slice. Slices below this size are suppressed (evaluation = null) to protect identity.',
	'metadata.totalOptionsConsidered':
		'Total individual suggestions found under the question (before filtering and clustering).',
	'metadata.optionsAfterFilter':
		'Suggestions remaining after the inclusion filter (consensus >= threshold OR (totalEvaluators >= 3 AND avg > 0.6)).',
	'metadata.aggregatesAfterClustering':
		'Number of aggregated suggestions produced by similarity clustering (each contains 1+ original suggestions).',
	'metadata.clusteringTriggered':
		'True if clustering was run as part of this export (no prior cached output existed).',

	topics:
		'Top-level grouping. Each topic contains aggregated suggestions on a related theme. Topics are LLM-derived from aggregate display names.',
	'topics[].topicId': 'Internal identifier for the topic within this export.',
	'topics[].topicName': 'Short human-readable topic title.',
	'topics[].topicSummary': 'One-sentence summary of what the topic covers (optional).',
	'topics[].aggregatedSuggestions': 'List of aggregated suggestions belonging to this topic.',

	'aggregatedSuggestion.aggregateId':
		'Internal identifier; corresponds to the cluster Statement when produced by topic-cluster, or the singleton Statement otherwise.',
	'aggregatedSuggestion.representativeText':
		'Display name of the cluster (LLM-named during the topic-cluster pipeline) or the original suggestion text for singletons.',
	'aggregatedSuggestion.memberStatements':
		'The original participant suggestions that were merged into this aggregate. Each entry preserves the participant idea text.',
	'aggregatedSuggestion.evaluation':
		'Pooled evaluation across ALL members. Each evaluator counted ONCE (averaged across the members they evaluated).',
	'aggregatedSuggestion.demographicBreakdown':
		'Per-(demographic question, answer) sliced evaluation aggregates with k-anonymity enforced.',

	'evaluation.C_p':
		'Confidence-adjusted consensus score. Formula: C_p = μ - t · SEM*. Range [-1, 1]. Higher = stronger agreement adjusted for sample size.',
	'evaluation.A_p':
		'Agreement Index. Formula: A_p = 1 - t · SEM*. Range [0, 1]. Sample-size sensitive; small samples score lower even with unanimous votes.',
	'evaluation.L_p':
		'Like-mindedness. Formula: L_p = 1 - SEM*. Range [0, 1]. Raw opinion similarity without t-penalty.',
	'evaluation.avg':
		'Mean sentiment μ = Σe / n. Range [-1, 1]. Descriptive statistic — what the community thinks on average.',
	'evaluation.totalEvaluators': 'Number of distinct evaluators after deduplication by userId.',
	'evaluation.pro': 'Number of evaluators whose averaged value across the aggregate was > 0.',
	'evaluation.con': 'Number of evaluators whose averaged value across the aggregate was < 0.',

	'demographicBreakdown[].demographicQuestionId':
		'ID of the demographic question (from userDemographicQuestions collection).',
	'demographicBreakdown[].demographicQuestionText': 'The text of the demographic question.',
	'demographicBreakdown[].answer': 'The specific answer label being sliced on.',
	'demographicBreakdown[].evaluation':
		'Re-pooled evaluation aggregate for evaluators who gave this answer. Null if suppressed by k-anonymity.',
	'demographicBreakdown[].suppressedByKAnonymity':
		'True if the slice was suppressed for privacy because fewer than kAnonymity evaluators belong to this group.',

	'demographicSummary.questions':
		'Distribution of answers across the entire evaluator pool, per demographic question. Counts are zeroed when suppressed by k-anonymity.',
};
