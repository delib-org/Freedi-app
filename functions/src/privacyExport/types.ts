/**
 * Privacy-Preserving Export Types (server-side).
 *
 * Mirrors the client's `src/types/privacyExport.ts` so the JSON payload
 * returned by the `privacyExport` Cloud Function matches the shape the client
 * already consumes. Kept self-contained (no client imports) so it can live in
 * the functions build.
 */

export type ExportDemographicQuestionType = 'radio' | 'checkbox' | 'text';
export type ExportDemographicScope = 'group' | 'statement';
export type DerivedPipeline = 'topic-cluster' | 'synthesis' | 'unknown-cluster';

export interface ExportDemographicQuestion {
	questionId: string;
	questionText: string;
	questionType: ExportDemographicQuestionType;
	options: string[];
	scope: ExportDemographicScope;
}

export interface DemographicResponseOption {
	optionValue: string;
	respondentCount: number;
	percentage: number;
}

export interface DemographicResponseStats {
	questionId: string;
	questionText: string;
	responses: DemographicResponseOption[];
	totalRespondents: number;
}

export interface AnonymizedEvaluation {
	statementId: string;
	statementText: string;
	evaluationValue: number;
}

/** 'direct' = votes on this option only; 'direct+merged' adds the merged* fields. */
export type OptionStatsMethod = 'direct' | 'direct+merged';

/**
 * One vote per user across a derived option and its member options, as the
 * app shows it. Flat (not nested) so CSV flattening stays one column each.
 */
export interface MergedOptionStats {
	mergedTotalEvaluators: number;
	mergedAverageEvaluation: number;
	mergedProCount: number;
	mergedConCount: number;
	mergedNeutralCount: number;
	mergedSumEvaluations: number;
	mergedAgreement: number;
	mergedAgreementIndex: number;
}

export interface OptionEvaluationSummary extends Partial<MergedOptionStats> {
	statementId: string;
	statementText: string;
	totalEvaluators: number;
	averageEvaluation: number;
	proCount: number;
	conCount: number;
	neutralCount: number;
	sumEvaluations: number;
	/** Consensus score of the direct votes (finite-population corrected when N is known). */
	agreement: number;
	/** Agreement index of the direct votes, in [0, 1]. */
	agreementIndex: number;
	/** True when the option is hidden in the app. Hidden options are still exported. */
	hide: boolean;
	isDerived: boolean;
	isCluster?: boolean;
	derivedByPipeline?: DerivedPipeline;
	integratedOptions?: string[];
	statsMethod: OptionStatsMethod;
}

export interface DemographicEvaluationStats {
	averageEvaluation: number;
	proCount: number;
	conCount: number;
	neutralCount: number;
	sumEvaluations: number;
}

export interface DemographicBreakdown {
	questionId: string;
	questionText: string;
	optionValue: string;
	evaluatorCount: number;
	meetsKAnonymity: boolean;
	stats?: DemographicEvaluationStats;
	privacyNote?: string;
}

export interface OptionWithDemographics {
	option: OptionEvaluationSummary;
	demographicBreakdowns: DemographicBreakdown[];
}

export interface ParticipationSummary {
	enteredCount: number | null;
	suggestedCount: number;
	evaluatedCount: number;
	totalParticipants: number;
}

export interface ExportParentStatement {
	statementId: string;
	statementText: string;
	description?: string;
}

export interface PrivacyExportMetadata {
	exportedAt: string;
	exportFormat: 'json' | 'csv';
	appVersion: string;
	totalRecords: number;
	kAnonymityThreshold: number;
	suppressedGroupCount: number;
	totalEvaluators: number;
	totalDemographicRespondents: number;
	/** Memberless themes (pipeline leftovers) left out of the export. */
	skippedEmptyThemes: number;
	/** N, the question's stakeholder count, when one is set. */
	stakeholderCount?: number;
	/** True when agreement values use the finite-population correction (N is set). */
	fpcApplied: boolean;
}

export interface PrivacyPreservingExportData {
	metadata: PrivacyExportMetadata;
	parentStatement: ExportParentStatement;
	participation: ParticipationSummary;
	demographicQuestions: ExportDemographicQuestion[];
	demographicStats: DemographicResponseStats[];
	optionEvaluations: OptionEvaluationSummary[];
	demographicBreakdowns: OptionWithDemographics[];
	/** In random order: no per-person sequence of votes survives. */
	anonymizedEvaluations?: AnonymizedEvaluation[];
	privacyNotice: string;
	/** How the per-option stats were computed (direct vs merged). */
	statsNotes: string;
}
