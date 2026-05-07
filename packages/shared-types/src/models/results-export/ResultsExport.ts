/**
 * Topic-Grouped Deliberation Results Export
 *
 * Schema for the derived dataset produced by `scripts/exportQuestionResults.ts`.
 * See `plans/topic-grouped-results-export.md` for the rationale and field definitions.
 *
 * Versioning: bump `schemaVersion` on any non-additive change. Additive changes
 * (new optional fields) keep the same major version.
 */

export const RESULTS_EXPORT_SCHEMA_VERSION = "1.0.0";

export type AgreementShape =
  | "consensus"
  | "skewed-positive"
  | "polarized"
  | "split"
  | "low-signal";

export interface AgreementHistogram {
  stronglyAgreeCount: number;     // evaluation >= 0.6
  weaklyAgreeCount: number;       // 0 < evaluation < 0.6
  neutralCount: number;           // evaluation == 0
  weaklyDisagreeCount: number;    // -0.6 < evaluation < 0
  stronglyDisagreeCount: number;  // evaluation <= -0.6
  agreementShape: AgreementShape;
}

export interface SolutionEvaluationStats {
  numberOfEvaluators: number;
  averageEvaluation: number;
  consensus: number;            // WizCol C_p = mu - t*SEM
  agreementIndex: number;       // 1 - t*SEM
  likeMindedness: number;       // 1 - SEM
  confidenceIndex?: number;     // optional; depends on targetPopulation
  proRatio: number;             // n_pro / n_total
  polarization: number;         // 1 - likeMindedness
}

export interface SynthesisProvenance {
  sourceCount: number;
  sourceIds: string[];
  sourceTitles: string[];       // short list of original phrasings
}

export interface RegenerationStatus {
  lastRegeneratedAt?: number;
  lastRegeneratedBy?: string;
  cannotSynthesize?: boolean;
}

interface BaseSolutionEntry {
  solutionId: string;
  title: string;
  description?: string;
  paragraphs?: string[];
  evaluation: SolutionEvaluationStats;
  agreementProfile: AgreementHistogram;
  /** Other topic IDs this solution belongs to (multi-topic case). */
  alsoIn?: string[];
}

export interface SynthesizedSolutionEntry extends BaseSolutionEntry {
  kind: "synthesis";
  derivedByPipeline: "synthesis" | "topic-cluster" | "unknown-cluster";
  provenance: SynthesisProvenance;
  regenerationStatus?: RegenerationStatus;
}

export interface StandaloneSolutionEntry extends BaseSolutionEntry {
  kind: "standalone";
  creatorId?: string;           // omitted/anonymized in shareable exports
  kept: {
    reason: string;
    rank: number;               // rank within topic by consensus, 1-based
  };
}

export type SolutionEntry = SynthesizedSolutionEntry | StandaloneSolutionEntry;

export interface TopicAgreement {
  averageConsensus: number;
  averageLikeMindedness: number;
  internalDivergence: number;   // SD of consensus across the topic's solutions
  evaluatorOverlap: number;     // fraction of users who evaluated >=2 solutions in this topic
  dominantCohortId?: string;
}

export interface TopicBlock {
  topicId: string;
  topicTitle: string;
  topicDescription?: string;
  memberCount: number;          // total options assigned to this topic by the cluster pipeline
  displayedCount: number;       // synthesized + surviving standalones
  agreement: TopicAgreement;
  synthesizedSolutions: SynthesizedSolutionEntry[];
  standaloneSolutions: StandaloneSolutionEntry[];
}

export interface CoalitionEntry {
  cohortId: string;
  size: number;
  characterization: string;
  topProposalIds: string[];
}

export interface QuestionAgreement {
  averageConsensus: number;
  averageLikeMindedness: number;
  polarization: number;         // 1 - averageLikeMindedness
  evaluatorEngagement: number;  // average solutions evaluated per user
}

export interface ExportThresholds {
  standaloneConsensusFloor: number;
  minEvaluators: number;
  synthesisIncludesAll: boolean;
  lowSignalEvaluatorThreshold: number;
}

export interface ExportSummary {
  totalOptions: number;             // visible options under the question (excludes hide=true)
  totalEvaluators: number;          // unique evaluator uids
  topicCount: number;
  synthesizedSolutionCount: number;
  standaloneAboveFloorCount: number;
  filteredOutCount: number;
}

export interface FilteredOutBlock {
  count: number;
  byReason: {
    belowConsensusFloor: number;
    lowEvaluators: number;
    hidden: number;
    unassigned: number;             // options the topic-cluster pipeline didn't place
  };
}

export interface ResultsExportMeta {
  schemaVersion: string;            // RESULTS_EXPORT_SCHEMA_VERSION
  source: "production" | "emulator" | "json-snapshot";
  sourceProjectId?: string;
  sourceFile?: string;              // path to local JSON if source=json-snapshot
}

export interface ResultsExport {
  meta: ResultsExportMeta;
  questionId: string;
  questionTitle: string;
  exportedAt: number;
  thresholds: ExportThresholds;
  summary: ExportSummary;
  agreement: {
    questionLevel: QuestionAgreement;
    coalitions: CoalitionEntry[];
  };
  topics: TopicBlock[];
  filteredOut: FilteredOutBlock;
}
