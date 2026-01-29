/**
 * Admin access utilities for Sign app
 * Handles permission checking for document admins and collaborators
 */

import { randomBytes } from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import {
	AdminPermissionLevel,
	Collections,
	hasPermissionLevel,
	DocumentCollaborator,
	ViewerLink,
} from '@freedi/shared-types';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Result of admin access check
 */
export interface AdminAccessResult {
	isAdmin: boolean;
	permissionLevel: AdminPermissionLevel | null;
	isOwner: boolean;
	isViewer: boolean;
}

/**
 * Check if a user has admin access to a document
 * Checks both document ownership and collaborator records
 * Includes retry logic for cold start resilience
 *
 * @param db - Firestore instance
 * @param documentId - Document ID to check
 * @param userId - User ID to check
 * @param retryCount - Number of retries on transient failures (default: 2)
 * @returns Admin access result with permission level
 */
export async function checkAdminAccess(
	db: Firestore,
	documentId: string,
	userId: string,
	retryCount: number = 2
): Promise<AdminAccessResult> {
	const attemptCheck = async (): Promise<AdminAccessResult> => {
		// Get the document to check ownership
		const docRef = db.collection(Collections.statements).doc(documentId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return {
				isAdmin: false,
				permissionLevel: null,
				isOwner: false,
				isViewer: false,
			};
		}

		const document = docSnap.data() as Statement;

		// Check if user is the owner (document creator)
		const isOwner = document.creator?.uid === userId || document.creatorId === userId;

		if (isOwner) {
			return {
				isAdmin: true,
				permissionLevel: AdminPermissionLevel.owner,
				isOwner: true,
				isViewer: false,
			};
		}

		// Check collaborators collection
		const collaboratorRef = db
			.collection(Collections.documentCollaborators)
			.doc(documentId)
			.collection('collaborators')
			.doc(userId);
		const collaboratorSnap = await collaboratorRef.get();

		if (collaboratorSnap.exists) {
			const collaborator = collaboratorSnap.data() as DocumentCollaborator;

			return {
				isAdmin: true,
				permissionLevel: collaborator.permissionLevel,
				isOwner: false,
				isViewer: collaborator.permissionLevel === AdminPermissionLevel.viewer,
			};
		}

		return {
			isAdmin: false,
			permissionLevel: null,
			isOwner: false,
			isViewer: false,
		};
	};

	// Retry logic for cold start resilience
	let lastError: unknown = null;
	for (let attempt = 0; attempt <= retryCount; attempt++) {
		try {
			return await attemptCheck();
		} catch (error) {
			lastError = error;
			const isLastAttempt = attempt === retryCount;

			// Log warning for retries, error only on final failure
			if (isLastAttempt) {
				logError(error, {
					operation: 'adminAccess.checkAdminAccess',
					documentId,
					userId,
					metadata: { attempt: attempt + 1, totalAttempts: retryCount + 1 }
				});
			} else {
				console.info(`[checkAdminAccess] Attempt ${attempt + 1} failed, retrying...`, {
					documentId,
					userId: userId.substring(0, 10) + '...',
					error: error instanceof Error ? error.message : 'Unknown error',
				});
				// Short delay before retry (100ms, 200ms)
				await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
			}
		}
	}

	// All retries failed - log detailed error for debugging
	console.error('[checkAdminAccess] All attempts failed', {
		documentId,
		userId: userId.substring(0, 10) + '...',
		error: lastError instanceof Error ? lastError.message : 'Unknown error',
	});

	return {
		isAdmin: false,
		permissionLevel: null,
		isOwner: false,
		isViewer: false,
	};
}

/**
 * Check if a viewer link token is valid
 *
 * @param db - Firestore instance
 * @param token - Viewer link token
 * @returns ViewerLink if valid and not expired, null otherwise
 */
export async function checkViewerLinkAccess(
	db: Firestore,
	token: string
): Promise<{ isValid: boolean; viewerLink: ViewerLink | null; documentId: string | null }> {
	try {
		const viewerLinksRef = db.collection(Collections.viewerLinks);
		const querySnapshot = await viewerLinksRef
			.where('token', '==', token)
			.where('isActive', '==', true)
			.limit(1)
			.get();

		if (querySnapshot.empty) {
			return { isValid: false, viewerLink: null, documentId: null };
		}

		const viewerLink = querySnapshot.docs[0].data() as ViewerLink;

		// Check if expired
		if (viewerLink.expiresAt < Date.now()) {
			return { isValid: false, viewerLink: null, documentId: null };
		}

		return {
			isValid: true,
			viewerLink,
			documentId: viewerLink.documentId,
		};
	} catch (error) {
		logError(error, { operation: 'adminAccess.checkViewerLinkAccess', metadata: { token } });
		return { isValid: false, viewerLink: null, documentId: null };
	}
}

/**
 * Check if user has required permission level
 * Wrapper around shared-types hasPermissionLevel for convenience
 */
export function checkPermission(
	userLevel: AdminPermissionLevel | null,
	requiredLevel: AdminPermissionLevel
): boolean {
	if (!userLevel) return false;

	return hasPermissionLevel(userLevel, requiredLevel);
}

/**
 * Get all collaborators for a document
 *
 * @param db - Firestore instance
 * @param documentId - Document ID
 * @returns Array of collaborators
 */
export async function getDocumentCollaborators(
	db: Firestore,
	documentId: string
): Promise<DocumentCollaborator[]> {
	try {
		const collaboratorsRef = db
			.collection(Collections.documentCollaborators)
			.doc(documentId)
			.collection('collaborators');
		const snapshot = await collaboratorsRef.get();

		return snapshot.docs.map(doc => doc.data() as DocumentCollaborator);
	} catch (error) {
		logError(error, { operation: 'adminAccess.getDocumentCollaborators', documentId });
		return [];
	}
}

/**
 * Get all active viewer links for a document
 *
 * @param db - Firestore instance
 * @param documentId - Document ID
 * @returns Array of active viewer links
 */
export async function getDocumentViewerLinks(
	db: Firestore,
	documentId: string
): Promise<ViewerLink[]> {
	try {
		const viewerLinksRef = db.collection(Collections.viewerLinks);
		const snapshot = await viewerLinksRef
			.where('documentId', '==', documentId)
			.where('isActive', '==', true)
			.get();

		// Filter out expired links
		const now = Date.now();

		return snapshot.docs
			.map(doc => doc.data() as ViewerLink)
			.filter(link => link.expiresAt > now);
	} catch (error) {
		logError(error, { operation: 'adminAccess.getDocumentViewerLinks', documentId });
		return [];
	}
}

/**
 * Generate a cryptographically secure token
 * Used for invitation and viewer link tokens
 */
export function generateSecureToken(): string {
	// Use randomBytes in Node.js environment
	// 32 bytes = 256 bits of entropy
	const bytes = randomBytes(32);

	return bytes.toString('base64url');
}
