/**
 * Firebase Analytics Integration for Version Control
 * Tracks key events and metrics for the version control system
 */

import { logEvent } from 'firebase/analytics';
import { analytics } from '@/controllers/db/firebase';

/**
 * Analytics Event Names
 * Following Firebase Analytics naming conventions (snake_case)
 */
export const VersionControlEvents = {
	// Queue events
	QUEUE_ITEM_CREATED: 'queue_item_created',
	QUEUE_ITEM_SUPERSEDED: 'queue_item_superseded',

	// Admin actions
	SUGGESTION_APPROVED: 'suggestion_approved',
	SUGGESTION_REJECTED: 'suggestion_rejected',
	SUGGESTION_EDITED_BEFORE_APPROVAL: 'suggestion_edited_before_approval',

	// Version history
	VERSION_RESTORED: 'version_restored',
	VERSION_HISTORY_VIEWED: 'version_history_viewed',

	// Settings
	VERSION_CONTROL_ENABLED: 'version_control_enabled',
	VERSION_CONTROL_DISABLED: 'version_control_disabled',
	REVIEW_THRESHOLD_CHANGED: 'review_threshold_changed',

	// User engagement
	QUEUE_LIST_VIEWED: 'queue_list_viewed',
	REVIEW_MODAL_OPENED: 'review_modal_opened',

	// Performance
	CONSENSUS_UPDATE_RECEIVED: 'consensus_update_received',
	VERSION_DECOMPRESSION_PERFORMED: 'version_decompression_performed',
} as const;

/**
 * Event Parameters Interface
 */
interface QueueItemCreatedParams {
	documentId: string;
	paragraphId: string;
	consensus: number;
	evaluationCount: number;
	userId?: string; // Anonymized or hashed
}

interface SuggestionApprovedParams {
	documentId: string;
	paragraphId: string;
	consensus: number;
	adminEdited: boolean;
	queuedDuration: number; // Time from queue creation to approval (ms)
	userId?: string;
}

interface SuggestionRejectedParams {
	documentId: string;
	paragraphId: string;
	consensus: number;
	reasonProvided: boolean;
	userId?: string;
}

interface VersionRestoredParams {
	documentId: string;
	paragraphId: string;
	fromVersion: number;
	toVersion: number;
	userId?: string;
}

interface SettingsChangedParams {
	documentId: string;
	oldThreshold?: number;
	newThreshold?: number;
	enabled: boolean;
	userId?: string;
}

/**
 * Track queue item creation
 */
export function trackQueueItemCreated(params: QueueItemCreatedParams): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.QUEUE_ITEM_CREATED, {
		document_id: anonymizeId(params.documentId),
		paragraph_id: anonymizeId(params.paragraphId),
		consensus: Math.round(params.consensus * 100) / 100,
		evaluation_count: params.evaluationCount,
		user_id: params.userId ? anonymizeId(params.userId) : undefined,
	});
}

/**
 * Track suggestion approval
 */
export function trackSuggestionApproved(params: SuggestionApprovedParams): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.SUGGESTION_APPROVED, {
		document_id: anonymizeId(params.documentId),
		paragraph_id: anonymizeId(params.paragraphId),
		consensus: Math.round(params.consensus * 100) / 100,
		admin_edited: params.adminEdited,
		queued_duration_ms: params.queuedDuration,
		user_id: params.userId ? anonymizeId(params.userId) : undefined,
	});
}

/**
 * Track suggestion rejection
 */
export function trackSuggestionRejected(params: SuggestionRejectedParams): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.SUGGESTION_REJECTED, {
		document_id: anonymizeId(params.documentId),
		paragraph_id: anonymizeId(params.paragraphId),
		consensus: Math.round(params.consensus * 100) / 100,
		reason_provided: params.reasonProvided,
		user_id: params.userId ? anonymizeId(params.userId) : undefined,
	});
}

/**
 * Track version restoration
 */
export function trackVersionRestored(params: VersionRestoredParams): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.VERSION_RESTORED, {
		document_id: anonymizeId(params.documentId),
		paragraph_id: anonymizeId(params.paragraphId),
		from_version: params.fromVersion,
		to_version: params.toVersion,
		version_jump: Math.abs(params.fromVersion - params.toVersion),
		user_id: params.userId ? anonymizeId(params.userId) : undefined,
	});
}

/**
 * Track settings changes
 */
export function trackSettingsChanged(params: SettingsChangedParams): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.REVIEW_THRESHOLD_CHANGED, {
		document_id: anonymizeId(params.documentId),
		old_threshold: params.oldThreshold,
		new_threshold: params.newThreshold,
		threshold_delta: params.oldThreshold && params.newThreshold
			? params.newThreshold - params.oldThreshold
			: undefined,
		enabled: params.enabled,
		user_id: params.userId ? anonymizeId(params.userId) : undefined,
	});
}

/**
 * Track version control enabled/disabled
 */
export function trackVersionControlToggled(
	documentId: string,
	enabled: boolean,
	userId?: string
): void {
	if (!analytics) return;

	const event = enabled
		? VersionControlEvents.VERSION_CONTROL_ENABLED
		: VersionControlEvents.VERSION_CONTROL_DISABLED;

	logEvent(analytics, event, {
		document_id: anonymizeId(documentId),
		user_id: userId ? anonymizeId(userId) : undefined,
	});
}

/**
 * Track queue list view
 */
export function trackQueueListViewed(
	documentId: string,
	pendingCount: number,
	userId?: string
): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.QUEUE_LIST_VIEWED, {
		document_id: anonymizeId(documentId),
		pending_count: pendingCount,
		user_id: userId ? anonymizeId(userId) : undefined,
	});
}

/**
 * Track review modal opened
 */
export function trackReviewModalOpened(
	documentId: string,
	consensus: number,
	userId?: string
): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.REVIEW_MODAL_OPENED, {
		document_id: anonymizeId(documentId),
		consensus: Math.round(consensus * 100) / 100,
		user_id: userId ? anonymizeId(userId) : undefined,
	});
}

/**
 * Track version history viewed
 */
export function trackVersionHistoryViewed(
	paragraphId: string,
	versionCount: number,
	userId?: string
): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.VERSION_HISTORY_VIEWED, {
		paragraph_id: anonymizeId(paragraphId),
		version_count: versionCount,
		user_id: userId ? anonymizeId(userId) : undefined,
	});
}

/**
 * Track consensus update performance
 */
export function trackConsensusUpdate(
	latencyMs: number,
	documentId: string
): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.CONSENSUS_UPDATE_RECEIVED, {
		document_id: anonymizeId(documentId),
		latency_ms: latencyMs,
	});
}

/**
 * Track version decompression performance
 */
export function trackVersionDecompression(
	durationMs: number,
	versionCount: number,
	paragraphId: string
): void {
	if (!analytics) return;

	logEvent(analytics, VersionControlEvents.VERSION_DECOMPRESSION_PERFORMED, {
		paragraph_id: anonymizeId(paragraphId),
		duration_ms: durationMs,
		version_count: versionCount,
	});
}

/**
 * Anonymize user/document IDs for privacy
 * Simple hash function for analytics (not cryptographically secure)
 */
function anonymizeId(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		const char = id.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return `anon_${Math.abs(hash)}`;
}

/**
 * Custom Metrics (for Performance Monitoring)
 */
export interface VersionControlMetrics {
	// Approval metrics
	averageApprovalTime: number; // Average time from queue to approval
	approvalRate: number; // % of queue items approved vs rejected

	// Admin engagement
	adminActiveDocuments: number; // Documents with active version control
	reviewQueueSize: number; // Current pending items

	// Version metrics
	averageVersionCount: number; // Average versions per paragraph
	restorationFrequency: number; // Rollbacks per week

	// Performance
	averageConsensusUpdateLatency: number; // Real-time update speed
	averageDecompressionTime: number; // Archive access speed
}

/**
 * Calculate approval rate for a document
 */
export function calculateApprovalRate(
	approvedCount: number,
	rejectedCount: number
): number {
	const total = approvedCount + rejectedCount;
	if (total === 0) return 0;
	return Math.round((approvedCount / total) * 100) / 100;
}

/**
 * Calculate average approval time
 */
export function calculateAverageApprovalTime(
	approvalDurations: number[]
): number {
	if (approvalDurations.length === 0) return 0;
	const sum = approvalDurations.reduce((acc, duration) => acc + duration, 0);
	return Math.round(sum / approvalDurations.length);
}
