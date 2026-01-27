import {
	object,
	string,
	number,
	optional,
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
