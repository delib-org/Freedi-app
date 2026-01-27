/**
 * Version Control Helper Utilities
 * Permission verification and audit logging for paragraph version control MVP
 */

import { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	AdminPermissionLevel,
	VersionControlAudit,
	AuditAction,
} from '@freedi/shared-types';
import { checkAdminAccess, AdminAccessResult } from './adminAccess';
import { logError } from './errorHandling';

/**
 * Verify user has admin access to a document
 * Throws error if user is not authenticated or not an admin
 *
 * @param db - Firestore instance
 * @param documentId - Document ID
 * @param userId - User ID (can be null)
 * @returns AdminAccessResult if user is admin
 * @throws Error if not authenticated or not admin
 */
export async function verifyAdmin(
	db: Firestore,
	documentId: string,
	userId: string | null
): Promise<AdminAccessResult> {
	if (!userId) {
		throw new Error('User not authenticated');
	}

	const accessResult = await checkAdminAccess(db, documentId, userId);

	if (!accessResult.isAdmin) {
		throw new Error('User is not an admin for this document');
	}

	// Viewers can't modify version control settings
	if (accessResult.permissionLevel === AdminPermissionLevel.viewer) {
		throw new Error('Viewer permission level cannot modify version control settings');
	}

	return accessResult;
}

/**
 * Verify user is document owner
 * Only owners can perform destructive actions like rollback
 *
 * @param db - Firestore instance
 * @param documentId - Document ID
 * @param userId - User ID (can be null)
 * @returns AdminAccessResult if user is owner
 * @throws Error if not owner
 */
export async function verifyOwner(
	db: Firestore,
	documentId: string,
	userId: string | null
): Promise<AdminAccessResult> {
	const accessResult = await verifyAdmin(db, documentId, userId);

	if (!accessResult.isOwner) {
		throw new Error('Only document owner can perform this action');
	}

	return accessResult;
}

/**
 * Interface for audit log parameters
 */
export interface AuditLogParams {
	documentId: string;
	userId: string;
	action: AuditAction;
	paragraphId?: string;
	metadata?: {
		oldValue?: string;
		newValue?: string;
		consensus?: number;
		notes?: string;
		fromVersion?: number;
		toVersion?: number;
	};
}

/**
 * Log a version control action to the audit trail
 * Critical actions are logged for accountability and debugging
 *
 * @param db - Firestore instance
 * @param params - Audit log parameters
 */
export async function logAudit(
	db: Firestore,
	params: AuditLogParams
): Promise<void> {
	try {
		const auditId = `audit_${Date.now()}_${params.userId}_${params.action}`;

		const auditEntry: VersionControlAudit = {
			auditId,
			documentId: params.documentId,
			paragraphId: params.paragraphId,
			userId: params.userId,
			action: params.action,
			timestamp: Date.now(),
			metadata: params.metadata,
		};

		await db
			.collection(Collections.versionControlAudit)
			.doc(auditId)
			.set(auditEntry);
	} catch (error) {
		// Log error but don't throw - audit logging is non-critical
		logError(error, {
			operation: 'versionControlHelpers.logAudit',
			documentId: params.documentId,
			userId: params.userId,
			action: params.action,
		});
	}
}

/**
 * Validate version control settings
 * Ensures settings are within acceptable bounds
 *
 * @param settings - Version control settings to validate
 * @throws Error if settings are invalid
 */
export function validateVersionControlSettings(settings: {
	reviewThreshold?: number;
	maxRecentVersions?: number;
	maxTotalVersions?: number;
}): void {
	if (settings.reviewThreshold !== undefined) {
		if (settings.reviewThreshold < 0 || settings.reviewThreshold > 1) {
			throw new Error('reviewThreshold must be between 0 and 1');
		}
	}

	if (settings.maxRecentVersions !== undefined) {
		if (settings.maxRecentVersions < 1 || settings.maxRecentVersions > 20) {
			throw new Error('maxRecentVersions must be between 1 and 20');
		}
	}

	if (settings.maxTotalVersions !== undefined) {
		if (settings.maxTotalVersions < 10 || settings.maxTotalVersions > 500) {
			throw new Error('maxTotalVersions must be between 10 and 500');
		}

		// Ensure maxTotalVersions >= maxRecentVersions
		if (
			settings.maxRecentVersions &&
			settings.maxTotalVersions < settings.maxRecentVersions
		) {
			throw new Error('maxTotalVersions must be >= maxRecentVersions');
		}
	}
}
