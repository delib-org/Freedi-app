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
}

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
}

/**
 * Complete privacy-preserving export data structure
 */
export interface PrivacyPreservingExportData {
	/** Export metadata */
	metadata: PrivacyExportMetadata;
	/** Summary of the parent statement */
	parentStatement: ExportParentStatement;
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
