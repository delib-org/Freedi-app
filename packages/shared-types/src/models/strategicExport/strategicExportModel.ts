/**
 * Strategic Export — types for the AI-ready strategic report export.
 *
 * Output shape: a single JSON document that an AI agent (e.g. an LLM analyst)
 * can dissect to write a strategic report for decision makers. Aggregates
 * similar suggestions across a single question, groups them into topics, and
 * provides demographic breakdowns under k-anonymity.
 */

export interface StrategicExportRequest {
	questionStatementId: string;
	consensusThreshold?: number; // default 0.4
	kAnonymity?: number; // default 5
	forceClustering?: boolean; // default false — if true, re-runs clustering even if cached
}

/**
 * Aggregated evaluation metrics for a pooled set of evaluators.
 * Computed via the WizCol consensus formulae from packages/shared-types/src/utils/consensusCalculation.
 */
export interface EvaluationAggregate {
	/** C_p = μ - t · SEM* — confidence-adjusted consensus score, [-1, 1]. */
	C_p: number;
	/** A_p = 1 - t · SEM* — agreement index with sample-size sensitivity, [0, 1]. */
	A_p: number;
	/** L_p = 1 - SEM* — raw like-mindedness, [0, 1]. */
	L_p: number;
	/** Mean sentiment μ = Σe / n, [-1, 1]. */
	avg: number;
	/** Number of distinct evaluators (post-deduplication by userId). */
	totalEvaluators: number;
	/** Count of evaluations with value > 0. */
	pro: number;
	/** Count of evaluations with value < 0. */
	con: number;
}

/** One member statement of an aggregated suggestion. */
export interface AggregateMember {
	statementId: string;
	text: string;
}

/** A single demographic-sliced evaluation aggregate. */
export interface DemographicSlice {
	demographicQuestionId: string;
	demographicQuestionText: string;
	answer: string;
	/** Null when slice was suppressed under k-anonymity. */
	evaluation: EvaluationAggregate | null;
	suppressedByKAnonymity: boolean;
}

/**
 * An aggregated suggestion: the merger of similar individual suggestions
 * detected via the topic-cluster pipeline. Single-member aggregates are also
 * possible (suggestion was unique).
 */
export interface AggregatedSuggestion {
	aggregateId: string;
	/** Cluster name from the topic-cluster naming step (LLM-generated). */
	representativeText: string;
	memberStatements: AggregateMember[];
	/** Pooled, deduped-by-userId evaluation aggregate. */
	evaluation: EvaluationAggregate;
	/** Per-(demographic question, answer) breakdown with k-anonymity enforced. */
	demographicBreakdown: DemographicSlice[];
}

/** A topic groups multiple aggregated suggestions. Topics derived by an LLM pass over aggregate names. */
export interface TopicGroup {
	topicId: string;
	topicName: string;
	/** Optional one-sentence topic summary (LLM-generated). */
	topicSummary?: string;
	aggregatedSuggestions: AggregatedSuggestion[];
}

export interface DemographicAnswerCount {
	answer: string;
	count: number;
	suppressedByKAnonymity: boolean;
}

export interface DemographicQuestionSummary {
	demographicQuestionId: string;
	questionText: string;
	totalRespondents: number;
	answers: DemographicAnswerCount[];
}

export interface StrategicExportMetadata {
	questionId: string;
	questionText: string;
	exportedAt: number;
	consensusThreshold: number;
	kAnonymity: number;
	totalOptionsConsidered: number;
	optionsAfterFilter: number;
	aggregatesAfterClustering: number;
	clusteringTriggered: boolean;
}

/**
 * A flat field-path → description map. Embedded in the export so a downstream
 * AI agent can interpret each metric without external documentation.
 */
export type StrategicExportSchema = Record<string, string>;

export interface StrategicExportResponse {
	_schema: StrategicExportSchema;
	metadata: StrategicExportMetadata;
	topics: TopicGroup[];
	demographicSummary: {
		questions: DemographicQuestionSummary[];
	};
}
