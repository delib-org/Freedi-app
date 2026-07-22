/**
 * Document Report — types for the Sign app's per-document engagement report.
 *
 * Output shape: a single JSON document that is (a) consumed by other AI agents
 * (self-describing via `_schema`) and (b) fed to an LLM to write a narrative
 * report for decision makers. Aggregates paragraph views, comments, approvals,
 * whole-document signatures/rejections, and k-anonymized demographic slices.
 */

import type { DemographicQuestionSummary } from "../strategicExport/strategicExportModel";

export const DOCUMENT_REPORT_VERSION = "1.2";

/**
 * A flat field-path → description map. Embedded in the report so a downstream
 * AI agent can interpret each metric without external documentation.
 */
export type DocumentReportSchema = Record<string, string>;

export interface DocumentReportMetadata {
	documentId: string;
	title: string;
	/** Document language from signSettings.defaultLanguage (falls back to 'en'). */
	language: string;
	paragraphCount: number;
	/** ms epoch */
	generatedAt: number;
	/** Minimum segment size for demographic slices (segments below are suppressed). */
	kAnonymity: number;
}

/** Participation funnel: each stage counts distinct people. */
export interface DocumentReportFunnel {
	/** Distinct visitor ids with at least one recorded paragraph view. */
	uniqueVisitors: number;
	/** Distinct authors of at least one visible comment anywhere in the document (on a paragraph or on the document itself). */
	commenters: number;
	/** Distinct users who voted on at least one paragraph (boolean approval OR ±1 evaluation). */
	approvers: number;
	/** Signatures with status 'signed'. */
	signers: number;
	/** Signatures with status 'rejected'. */
	rejecters: number;
	/** Signatures with status 'viewed' (opened the sign flow but neither signed nor rejected). */
	viewedOnlySignatures: number;
}

export interface ParagraphViewStats {
	/** Total recorded views (deduped per visitor per paragraph at write time). */
	total: number;
	uniqueViewers: number;
	/** Mean dwell time in seconds, null when no views. */
	avgDurationSeconds: number | null;
	/** uniqueViewers / funnel.uniqueVisitors, 0..1. */
	readThroughPct: number;
}

export interface ParagraphApprovalStats {
	/** Count of users who approved (boolean approval mechanism). */
	approved: number;
	/** Total users who voted on this paragraph. */
	totalVoters: number;
	/** approved / totalVoters, 0..1 (0 when no voters). */
	averageApproval: number;
}

export interface ParagraphEvaluationStats {
	/** Count of positive (+1) evaluations. */
	pro: number;
	/** Count of negative (-1) evaluations. */
	con: number;
	/** Mean evaluation, -1..1 (0 when none). */
	avg: number;
	total: number;
}

export interface ReportComment {
	/** Stable anonymous id (user_1, user_2, ...) — never a real user id. */
	anonymousId: string;
	text: string;
	likes: number;
	dislikes: number;
	/** ms epoch */
	createdAt: number;
}

export interface ParagraphComments {
	/** Total visible comments on this paragraph (may exceed items.length — items are capped). */
	count: number;
	items: ReportComment[];
}

export interface ParagraphReport {
	paragraphId: string;
	/** 1-based paragraph number, matching the §N shown to readers and admins. */
	order: number;
	/** First ~200 characters of the paragraph text. */
	textPreview: string;
	views: ParagraphViewStats;
	approval: ParagraphApprovalStats;
	evaluations: ParagraphEvaluationStats;
	comments: ParagraphComments;
}

export interface DocumentSignatureStats {
	signed: number;
	rejected: number;
	/**
	 * Signature records with status 'viewed'. In satisfaction mode most of these
	 * users DID respond — check the satisfaction fields before reading this as
	 * "opened but did not complete".
	 */
	viewed: number;
	/**
	 * Users who rated the whole document on the -1..+1 satisfaction scale.
	 * In satisfaction mode this is the document-level verdict; approve/reject
	 * are simply the +1/-1 endpoints of this same scale.
	 */
	satisfactionCount: number;
	/** Satisfaction ratings > 0 (leaning approve). */
	satisfactionPositive: number;
	/** Satisfaction ratings < 0 (leaning reject). */
	satisfactionNegative: number;
	/** Mean of Signature.satisfaction (-1..1), null when none reported. */
	averageSatisfaction: number | null;
	/** Free-text rejection reasons, stripped of any user identifiers. */
	rejectionReasons: string[];
}

/** Reference to a notable paragraph with the score that made it notable. */
export interface ParagraphRef {
	paragraphId: string;
	/** 1-based paragraph number, matching the §N shown to readers and admins. */
	order: number;
	textPreview: string;
	/**
	 * Support level 0..1 that ranked this paragraph, derived from boolean
	 * approvals when present, otherwise from ±1 evaluations mapped to 0..1.
	 */
	score: number;
	/** Human-readable explanation of why this paragraph is listed. */
	reason: string;
}

export interface ReadThroughPoint {
	order: number;
	paragraphId: string;
	/** uniqueViewers / funnel.uniqueVisitors at this paragraph, 0..1. */
	retention: number;
}

export interface DropOffPoint {
	paragraphId: string;
	order: number;
	/** Retention at the previous paragraph, 0..1. */
	retentionBefore: number;
	/** Retention at this paragraph, 0..1. */
	retentionAfter: number;
}

export interface DocumentReportInsights {
	/** Paragraphs with the highest approval (min-voter floor applied). */
	topConsensus: ParagraphRef[];
	/** Paragraphs with the lowest approval / most negative signals. */
	topFriction: ParagraphRef[];
	/** Retention per paragraph in document order. */
	readThroughCurve: ReadThroughPoint[];
	/** Paragraphs where retention drops sharply vs the previous paragraph. */
	dropOff: DropOffPoint[];
}

export interface DocumentReport {
	_schema: DocumentReportSchema;
	reportVersion: string;
	metadata: DocumentReportMetadata;
	funnel: DocumentReportFunnel;
	/** Ordered by paragraph order. */
	paragraphs: ParagraphReport[];
	/** Comments attached to the whole document rather than a specific paragraph. */
	documentComments: ParagraphComments;
	documentSignatures: DocumentSignatureStats;
	insights: DocumentReportInsights;
	/** K-anonymized demographic summaries (empty when no demographic data). */
	demographics: DemographicQuestionSummary[];
}

// ---------------------------------------------------------------------------
// AI narrative
// ---------------------------------------------------------------------------

export type NarrativeSectionId =
	| "executiveSummary"
	| "engagement"
	| "communityLikes"
	| "frictionPoints"
	| "paragraphRecommendations"
	| "psychologicalInsights"
	| "nextSteps";

export const NARRATIVE_SECTION_IDS: NarrativeSectionId[] = [
	"executiveSummary",
	"engagement",
	"communityLikes",
	"frictionPoints",
	"paragraphRecommendations",
	"psychologicalInsights",
	"nextSteps",
];

export interface NarrativeSection {
	id: NarrativeSectionId;
	/** Section title in the report language. */
	title: string;
	/** Markdown body in the report language. */
	body: string;
}

export interface DocumentReportNarrative {
	reportVersion: string;
	/** ms epoch */
	generatedAt: number;
	/** LLM model id used for generation. */
	model: string;
	/** Language the narrative is written in. */
	language: string;
	/** Ordered sections (the 7 fixed ids). */
	sections: NarrativeSection[];
}

/** Firestore doc in Collections.documentReports, id = documentId. */
export interface DocumentReportRecord {
	docId: string;
	json: DocumentReport;
	narrative: DocumentReportNarrative | null;
	/** ms epoch of the latest (re)generation of `json`. */
	generatedAt: number;
	/** userId of the admin who triggered the latest generation. */
	generatedBy: string;
	reportVersion: string;
}
