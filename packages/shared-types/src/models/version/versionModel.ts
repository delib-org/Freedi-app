import {
	object,
	string,
	boolean,
	number,
	optional,
	array,
	InferOutput,
	enum_,
	nullable,
} from 'valibot';
import { ParagraphSchema } from '../paragraph/paragraphModel';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Version status - tracks the lifecycle of a document version
 */
export enum VersionStatus {
	draft = 'draft', // AI generated, pending admin review
	published = 'published', // Approved and visible to public
	archived = 'archived', // Old version, kept for history
}

/**
 * Admin decision on a proposed change
 */
export enum ChangeDecision {
	pending = 'pending', // Not yet reviewed
	approved = 'approved', // Accepted as-is
	rejected = 'rejected', // Not included in version
	modified = 'modified', // Accepted with edits
}

/**
 * Type of change made to a paragraph
 */
export enum ChangeType {
	modified = 'modified', // Content was changed
	added = 'added', // New paragraph added
	removed = 'removed', // Paragraph was removed
	unchanged = 'unchanged', // No change needed
}

/**
 * Source type for a change
 */
export enum ChangeSourceType {
	suggestion = 'suggestion', // From a user suggestion
	comment = 'comment', // From a user comment
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Settings for version generation - configurable per document
 */
export const VersionGenerationSettingsSchema = object({
	k1: number(), // Multiplier for suggestions/comments (default: 5)
	k2: number(), // Multiplier for support/objection (default: 3)
	minImpactThreshold: number(), // Minimum impact score to consider (default: 0.1)
	includeComments: boolean(), // Whether to include comments in AI analysis
	includeSuggestions: boolean(), // Whether to include suggestions in AI analysis
});

export type VersionGenerationSettings = InferOutput<
	typeof VersionGenerationSettingsSchema
>;

/**
 * Default generation settings
 */
export const DEFAULT_VERSION_GENERATION_SETTINGS: VersionGenerationSettings = {
	k1: 5,
	k2: 3,
	minImpactThreshold: 0.1,
	includeComments: true,
	includeSuggestions: true,
};

/**
 * Source of a change - links to the original suggestion or comment
 */
export const ChangeSourceSchema = object({
	type: enum_(ChangeSourceType),
	sourceId: string(), // suggestionId or commentId
	content: string(), // Original content of the suggestion/comment
	impact: number(), // Calculated impact score
	supporters: number(), // Number of users who supported
	objectors: number(), // Number of users who objected
	creatorId: string(),
	creatorDisplayName: string(),
});

export type ChangeSource = InferOutput<typeof ChangeSourceSchema>;

/**
 * A single change proposed for a paragraph
 */
export const VersionChangeSchema = object({
	changeId: string(),
	versionId: string(),
	paragraphId: string(),

	// Content
	originalContent: string(),
	proposedContent: string(), // AI-generated proposed change
	finalContent: optional(string()), // After admin edit (if modified)

	// Type and status
	changeType: enum_(ChangeType),
	adminDecision: enum_(ChangeDecision),

	// Sources - what led to this change
	sources: array(ChangeSourceSchema),

	// AI reasoning
	aiReasoning: string(), // Explanation from AI for the change
	combinedImpact: number(), // Sum of all source impacts

	// Admin tracking
	adminModifiedAt: optional(number()),
	adminModifiedBy: optional(string()),
	adminNote: optional(string()), // Optional note from admin
});

export type VersionChange = InferOutput<typeof VersionChangeSchema>;

/**
 * A document version - snapshot of the document at a point in time
 */
export const DocumentVersionSchema = object({
	versionId: string(), // `${documentId}--v${versionNumber}`
	documentId: string(),
	versionNumber: number(), // 1, 2, 3...

	// Content - snapshot of paragraphs
	paragraphs: array(ParagraphSchema),

	// Status and lifecycle
	status: enum_(VersionStatus),
	createdAt: number(),
	publishedAt: optional(number()),
	createdBy: string(), // userId who initiated generation
	publishedBy: optional(string()), // userId who published

	// AI generation metadata
	aiGenerated: boolean(),
	aiModel: optional(string()), // e.g., "gpt-4", "claude-3"
	generationSettings: optional(VersionGenerationSettingsSchema),

	// Statistics at time of generation
	totalViewers: optional(number()), // Document viewers when generated
	totalSuggestions: optional(number()),
	totalComments: optional(number()),
	changesCount: optional(number()), // Number of paragraphs changed

	// Summary
	summary: optional(string()), // AI-generated summary of changes
});

export type DocumentVersion = InferOutput<typeof DocumentVersionSchema>;

/**
 * Versioning settings per document
 */
export const DocumentVersioningSettingsSchema = object({
	documentId: string(),
	enabled: boolean(),
	k1: number(), // default: 5
	k2: number(), // default: 3
	minImpactThreshold: number(), // default: 0.1
	autoGenerateOnThreshold: optional(number()), // Optional: auto-generate when X suggestions accumulated
	lastUpdated: number(),
	updatedBy: string(),
});

export type DocumentVersioningSettings = InferOutput<
	typeof DocumentVersioningSettingsSchema
>;

/**
 * Default versioning settings
 */
export const DEFAULT_VERSIONING_SETTINGS: Omit<
	DocumentVersioningSettings,
	'documentId' | 'lastUpdated' | 'updatedBy'
> = {
	enabled: true,
	k1: 5,
	k2: 3,
	minImpactThreshold: 0.1,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate version ID from document ID and version number
 */
export function getVersionId(documentId: string, versionNumber: number): string {
	return `${documentId}--v${versionNumber}`;
}

/**
 * Generate change ID
 */
export function getChangeId(versionId: string, paragraphId: string): string {
	return `${versionId}--${paragraphId}`;
}

/**
 * Calculate impact score for a suggestion or comment
 *
 * Formula: ((1 + supporters * k2 - objectors * k2) / totalViewers) * k1
 *
 * @param supporters - Number of users who supported
 * @param objectors - Number of users who objected
 * @param totalViewers - Total document viewers
 * @param k1 - Multiplier for suggestions/comments (default: 5)
 * @param k2 - Multiplier for support/objection (default: 3)
 * @returns Impact score (minimum 0)
 */
export function calculateImpact(
	supporters: number,
	objectors: number,
	totalViewers: number,
	k1: number = 5,
	k2: number = 3
): number {
	if (totalViewers <= 0) return 0;

	const netSupport = 1 + supporters * k2 - objectors * k2;
	const impact = (netSupport / totalViewers) * k1;

	return Math.max(0, impact);
}

/**
 * Check if a change has significant impact
 */
export function hasSignificantImpact(
	impact: number,
	threshold: number = 0.1
): boolean {
	return impact >= threshold;
}

/**
 * Sort changes by combined impact (highest first)
 */
export function sortChangesByImpact(changes: VersionChange[]): VersionChange[] {
	return [...changes].sort((a, b) => b.combinedImpact - a.combinedImpact);
}

/**
 * Filter changes that meet the minimum impact threshold
 */
export function filterSignificantChanges(
	changes: VersionChange[],
	threshold: number = 0.1
): VersionChange[] {
	return changes.filter((change) => change.combinedImpact >= threshold);
}
