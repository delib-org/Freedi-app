import {
	object,
	string,
	number,
	optional,
	boolean,
	enum_,
	InferOutput,
} from 'valibot';

/**
 * Status of a replacement queue item
 */
export enum ReplacementQueueStatus {
	pending = 'pending',
	approved = 'approved',
	rejected = 'rejected',
	superseded = 'superseded', // Replaced by newer suggestion
}

/**
 * Type of document action (consensus-driven)
 */
export enum DocumentActionType {
	replace = 'replace', // Existing: replace paragraph text with suggestion
	remove = 'remove',   // New: auto-remove paragraph when consensus drops below threshold
	add = 'add',         // New: auto-add paragraph from insertion point suggestion
}

/**
 * Pending Replacement Queue Schema
 *
 * Tracks suggestions that have reached the review threshold and are awaiting admin approval.
 * Real-time consensus updates via Cloud Function trigger.
 */
export const PendingReplacementSchema = object({
	queueId: string(),

	// References
	documentId: string(),
	paragraphId: string(),
	suggestionId: string(),

	// Content (snapshot at queue creation)
	currentText: string(),
	proposedText: string(),

	// Metadata (real-time via listener)
	consensus: number(), // Updated in real-time as votes change
	consensusAtCreation: number(), // Snapshot when queued (for staleness detection)
	evaluationCount: number(),
	positiveEvaluations: optional(number()), // Votes in favor
	negativeEvaluations: optional(number()), // Votes against
	createdAt: number(),

	// Creator info (denormalized for faster notifications)
	creatorId: string(), // Suggestion creator
	creatorDisplayName: optional(string()),

	// Status
	status: enum_(ReplacementQueueStatus),

	// Superseded tracking
	supersededBy: optional(string()), // suggestionId that replaced this
	supersededAt: optional(number()),

	// Admin action tracking
	reviewedBy: optional(string()), // userId
	reviewedAt: optional(number()),
	adminNotes: optional(string()),
	adminEditedText: optional(string()), // if admin modified before approval

	// Action type (defaults to 'replace' for backward compatibility)
	actionType: optional(enum_(DocumentActionType)), // 'replace' | 'remove' | 'add'

	// For 'add' actions: insertion point context
	insertionPointId: optional(string()),       // statementId of the insertion point
	insertAfterParagraphId: optional(string()), // paragraph after which to insert

	// Auto-execution tracking
	autoExecuted: optional(boolean()),  // true if auto-executed by Cloud Function
	autoExecutedAt: optional(number()), // timestamp of auto-execution
});

export type PendingReplacement = InferOutput<typeof PendingReplacementSchema>;

/**
 * Audit action types
 */
export enum AuditAction {
	settings_changed = 'settings_changed',
	approval_granted = 'approval_granted',
	approval_rejected = 'approval_rejected',
	rollback_executed = 'rollback_executed',
}

/**
 * Version Control Audit Log Schema
 *
 * Tracks critical admin actions for accountability and debugging
 */
export const VersionControlAuditSchema = object({
	auditId: string(),
	documentId: string(),
	paragraphId: optional(string()), // optional for document-level settings

	userId: string(),

	action: enum_(AuditAction),

	timestamp: number(),

	metadata: optional(object({
		oldValue: optional(string()),
		newValue: optional(string()),
		consensus: optional(number()),
		notes: optional(string()),
		fromVersion: optional(number()),
		toVersion: optional(number()),
	})),
});

export type VersionControlAudit = InferOutput<typeof VersionControlAuditSchema>;

/**
 * Version Archive Schema
 *
 * Compressed storage for versions 5+ to prevent database bloat.
 * Stored in subcollection: statements/{paragraphId}/versionArchive/{archiveId}
 */
export const VersionArchiveSchema = object({
	archiveId: string(), // e.g., 'archive_5_to_10'
	startVersion: number(), // 5
	endVersion: number(), // 10
	compressedData: string(), // gzip-compressed JSON (base64 encoded)
	createdAt: number(),
});

export type VersionArchive = InferOutput<typeof VersionArchiveSchema>;

// ============================================================================
// DOCUMENT ACTION HISTORY
// ============================================================================

/**
 * Document Action History Schema
 *
 * Records all automatic consensus-driven actions (removal, addition, replacement)
 * for audit trail and undo functionality.
 *
 * Stored in collection: documentActionHistory
 */
export const DocumentActionHistorySchema = object({
	actionId: string(),
	documentId: string(),
	paragraphId: string(), // The affected paragraph (or insertion point for 'add')

	actionType: enum_(DocumentActionType), // 'replace' | 'remove' | 'add'

	// Content snapshots for undo
	previousContent: optional(string()), // For 'remove': the removed text; for 'replace': old text
	newContent: optional(string()),       // For 'add': the added text; for 'replace': new text

	// Consensus data at time of action
	consensus: number(),
	evaluatorCount: number(),

	// Execution info
	executedAt: number(),
	queueItemId: optional(string()), // Reference to PendingReplacement if applicable

	// For 'add' actions: context
	insertionPointId: optional(string()),
	insertAfterParagraphId: optional(string()),
	newParagraphId: optional(string()), // The created paragraph's statementId

	// Undo tracking
	undoneAt: optional(number()),   // Set when admin undoes this action
	undoneBy: optional(string()),   // Admin userId who undid

	// Cooldown: after undo, prevent re-triggering for 24h
	cooldownUntil: optional(number()), // timestamp; auto-actions blocked until this time
});

export type DocumentActionHistory = InferOutput<typeof DocumentActionHistorySchema>;
