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

export interface OptionEvaluationSummary {
	statementId: string;
	statementText: string;
	totalEvaluators: number;
	averageEvaluation: number;
	proCount: number;
	conCount: number;
	neutralCount: number;
	sumEvaluations: number;
	isDerived: boolean;
	isCluster?: boolean;
	derivedByPipeline?: DerivedPipeline;
	integratedOptions?: string[];
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
}

export interface PrivacyPreservingExportData {
	metadata: PrivacyExportMetadata;
	parentStatement: ExportParentStatement;
	participation: ParticipationSummary;
	demographicQuestions: ExportDemographicQuestion[];
	demographicStats: DemographicResponseStats[];
	optionEvaluations: OptionEvaluationSummary[];
	demographicBreakdowns: OptionWithDemographics[];
	anonymizedEvaluations?: AnonymizedEvaluation[];
	privacyNotice: string;
}
