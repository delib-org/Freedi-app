import {
	object,
	string,
	number,
	optional,
	array,
	InferOutput,
	enum_,
} from 'valibot';
import { ChangeDecision, ChangeSourceType } from './versionModel';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Types of incoherence that can be detected across a document
 */
export enum IncoherenceType {
	contradiction = 'contradiction', // Two paragraphs say conflicting things
	redundancy = 'redundancy', // Duplicate or overlapping content
	gap = 'gap', // Missing logical connection between paragraphs
	scopeDrift = 'scopeDrift', // Paragraph doesn't align with document's scope
}

/**
 * Severity of an incoherence issue
 */
export enum IncoherenceSeverity {
	high = 'high', // Must be addressed before publishing
	medium = 'medium', // Should be addressed
	low = 'low', // Minor issue, can be ignored
}

/**
 * Action taken on a paragraph during version generation
 */
export enum ParagraphAction {
	kept = 'kept', // Content unchanged
	modified = 'modified', // Content was changed
	removed = 'removed', // Paragraph was removed
	added = 'added', // New paragraph was added
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * A single feedback item addressed by a paragraph change
 */
export const FeedbackAddressedSchema = object({
	sourceId: string(),
	sourceType: enum_(ChangeSourceType),
	summary: string(),
	impact: number(),
});

export type FeedbackAddressed = InferOutput<typeof FeedbackAddressedSchema>;

/**
 * Reasoning path for a single paragraph - tracks why it changed
 */
export const ParagraphReasoningPathSchema = object({
	paragraphId: string(),
	action: enum_(ParagraphAction),
	feedbackAddressed: array(FeedbackAddressedSchema),
	coherenceIssuesResolved: array(string()), // recordIds
	coherenceIssuesCreated: array(string()), // recordIds
	aiDecisionSummary: string(),
	previousContent: optional(string()),
	newContent: optional(string()),
});

export type ParagraphReasoningPath = InferOutput<typeof ParagraphReasoningPathSchema>;

/**
 * An incoherence record - a detected issue across the document
 * Stored in the `coherenceRecords` collection
 */
export const IncoherenceRecordSchema = object({
	recordId: string(), // ${versionId}--coh--${index}
	versionId: string(),
	documentId: string(),
	affectedParagraphIds: array(string()), // All paragraphs involved
	primaryParagraphId: string(), // The one the fix targets
	type: enum_(IncoherenceType),
	severity: enum_(IncoherenceSeverity),
	description: string(), // AI explanation of the issue
	suggestedFix: string(), // Proposed content for primaryParagraphId
	aiReasoning: string(), // Why this fix was suggested
	adminDecision: enum_(ChangeDecision), // Reuse existing enum
	adminNote: optional(string()),
	adminReviewedAt: optional(number()),
	adminReviewedBy: optional(string()),
	createdAt: number(),
});

export type IncoherenceRecord = InferOutput<typeof IncoherenceRecordSchema>;

// ============================================================================
// TRANSIENT TYPES (not stored separately)
// ============================================================================

/**
 * Result of a coherence analysis - returned by the AI analyzer
 * Not stored as a document; its parts are stored separately.
 */
export interface CoherenceAnalysisResult {
	incoherences: IncoherenceRecord[];
	documentCoherenceScore: number; // 0-1
	reasoningPaths: ParagraphReasoningPath[];
	summary: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a coherence record ID
 */
export function getCoherenceRecordId(versionId: string, index: number): string {
	return `${versionId}--coh--${index}`;
}
