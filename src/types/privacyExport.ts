/**
 * Privacy-Preserving Export Types
 *
 * Types for exporting user evaluation data with demographic breakdowns
 * while maintaining k-anonymity for privacy protection.
 */

import { ExportFormat, ExportMetadata } from './export';

/**
 * Demographic question type for export
 */
export type ExportDemographicQuestionType = 'radio' | 'checkbox' | 'text';

/**
 * Demographic question scope
 */
export type ExportDemographicScope = 'group' | 'statement';

/**
 * Demographic question info for export
 */
export interface ExportDemographicQuestion {
	questionId: string;
	questionText: string;
	questionType: ExportDemographicQuestionType;
	options: string[];
	scope: ExportDemographicScope;
}

/**
 * Single response option statistics
 */
export interface DemographicResponseOption {
	optionValue: string;
	respondentCount: number;
	percentage: number;
}

/**
 * Demographic response statistics (for question-level summary)
 */
export interface DemographicResponseStats {
	questionId: string;
	questionText: string;
	responses: DemographicResponseOption[];
	totalRespondents: number;
}

/**
 * Anonymized evaluation - no user identity attached
 */
export interface AnonymizedEvaluation {
	/** The option/statement being evaluated */
	statementId: string;
	statementText: string;
	/** Evaluation value from -1 to 1 */
	evaluationValue: number;
}

/**
 * Evaluation breakdown by option
 */
export interface OptionEvaluationSummary {
	statementId: string;
	statementText: string;
	/** Total number of evaluators */
	totalEvaluators: number;
	/** Average evaluation (-1 to 1) */
	averageEvaluation: number;
	/** Count of positive evaluations */
	proCount: number;
	/** Count of negative evaluations */
	conCount: number;
	/** Count of neutral evaluations */
	neutralCount: number;
	/** Sum of all evaluations */
	sumEvaluations: number;
	/** True when the option was produced by the clustering/synthesis pipeline rather than submitted by a participant */
	isDerived: boolean;
	/** True when the option is a cluster container grouping other options */
	isCluster?: boolean;
	/** Which pipeline produced it, when derived. Documents predating the field report 'unknown-cluster'. */
	derivedByPipeline?: 'topic-cluster' | 'synthesis' | 'unknown-cluster';
	/** IDs of the source options merged into this one, when derived */
	integratedOptions?: string[];
	/** Consensus score of the direct votes (finite-population corrected when N is known). Server export only. */
	agreement?: number;
	/** Agreement index of the direct votes, in [0, 1]. Server export only. */
	agreementIndex?: number;
	/** True when the option is hidden in the app. Hidden options are still exported. Server export only. */
	hide?: boolean;
	/** 'direct' = votes on this option only; 'direct+merged' adds the merged* fields. Server export only. */
	statsMethod?: OptionStatsMethod;
	/** Derived options: one vote per user across the option and its members, as shown in the app. */
	mergedTotalEvaluators?: number;
	mergedAverageEvaluation?: number;
	mergedProCount?: number;
	mergedConCount?: number;
	mergedNeutralCount?: number;
	mergedSumEvaluations?: number;
	mergedAgreement?: number;
	mergedAgreementIndex?: number;
}

/** How an option's stats were computed. */
export type OptionStatsMethod = 'direct' | 'direct+merged';

/**
 * Evaluation stats for a demographic breakdown (when k-anonymity is met)
 */
export interface DemographicEvaluationStats {
	averageEvaluation: number;
	proCount: number;
	conCount: number;
	neutralCount: number;
	sumEvaluations: number;
}

/**
 * Demographic breakdown for a specific option
 */
export interface DemographicBreakdown {
	questionId: string;
	questionText: string;
	optionValue: string;
	/** Number of users in this demographic who evaluated */
	evaluatorCount: number;
	/** True if breakdown stats are shown (k-anonymity met) */
	meetsKAnonymity: boolean;
	/** Evaluation stats - only populated if meetsKAnonymity is true */
	stats?: DemographicEvaluationStats;
	/** Message when k-anonymity not met */
	privacyNote?: string;
}

/**
 * Full evaluation data for an option with demographic breakdowns
 */
export interface OptionWithDemographics {
	/** Option details */
	option: OptionEvaluationSummary;
	/** Demographic breakdowns - one per question/option combination */
	demographicBreakdowns: DemographicBreakdown[];
}

/**
 * Participation funnel summary for the question
 */
export interface ParticipationSummary {
	/** Unique users who entered/viewed the question (null when view tracking is unavailable) */
	enteredCount: number | null;
	/** Unique users who suggested at least one option */
	suggestedCount: number;
	/** Unique users who evaluated at least one option */
	evaluatedCount: number;
	/** Unique users who suggested or evaluated (union) */
	totalParticipants: number;
}

/**
 * Parent statement info for export
 */
export interface ExportParentStatement {
	statementId: string;
	statementText: string;
	description?: string;
}

/**
 * Extended export metadata for privacy exports
 */
export interface PrivacyExportMetadata extends ExportMetadata {
	/** k-anonymity threshold used */
	kAnonymityThreshold: number;
	/** Number of groups that didn't meet k-anonymity */
	suppressedGroupCount: number;
	/** Total unique evaluators */
	totalEvaluators: number;
	/** Total demographic respondents */
	totalDemographicRespondents: number;
	/** Memberless themes (pipeline leftovers) left out of the export. Server export only. */
	skippedEmptyThemes?: number;
	/** N, the question's stakeholder count, when one is set. */
	stakeholderCount?: number;
	/** True when agreement values use the finite-population correction. Server export only. */
	fpcApplied?: boolean;
}

/**
 * Complete privacy-preserving export data structure
 */
export interface PrivacyPreservingExportData {
	/** Export metadata */
	metadata: PrivacyExportMetadata;
	/** Summary of the parent statement */
	parentStatement: ExportParentStatement;
	/** Participation funnel: entered → suggested → evaluated */
	participation: ParticipationSummary;
	/** Demographic questions used */
	demographicQuestions: ExportDemographicQuestion[];
	/** How many users answered each demographic question */
	demographicStats: DemographicResponseStats[];
	/** Evaluation summaries per option */
	optionEvaluations: OptionEvaluationSummary[];
	/** Detailed breakdowns by demographic (privacy-filtered) */
	demographicBreakdowns: OptionWithDemographics[];
	/** Anonymized individual evaluations (optional, if requested) */
	anonymizedEvaluations?: AnonymizedEvaluation[];
	/** Privacy notice */
	privacyNotice: string;
	/** How the per-option stats were computed (direct vs merged). Server export only. */
	statsNotes?: string;
}

/**
 * Options for privacy export
 */
export interface PrivacyExportOptions {
	/** K-anonymity threshold (default: 3) */
	kAnonymityThreshold?: number;
	/** Whether to include anonymized individual evaluations */
	includeAnonymizedEvaluations?: boolean;
	/** Export format */
	format: ExportFormat;
}
