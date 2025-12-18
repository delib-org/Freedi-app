import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentCollaborator,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * PATCH /api/admin/collaborators/[docId]/[userId]
 * Update a collaborator's permission level
 * Accessible by owner or admin (but cannot modify owner)
 */
export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; userId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, userId: targetUserId } = await params;
		const currentUserId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!currentUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be owner or admin to change roles
		const accessResult = await checkAdminAccess(db, docId, currentUserId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Only owner and admin can change roles
		if (accessResult.permissionLevel !== AdminPermissionLevel.owner &&
			accessResult.permissionLevel !== AdminPermissionLevel.admin) {
			return NextResponse.json(
				{ error: 'Forbidden - Only owners and admins can change roles' },
				{ status: 403 }
			);
		}

		// Check if target is the owner - cannot modify owner
		const targetAccessResult = await checkAdminAccess(db, docId, targetUserId);

		if (targetAccessResult.isOwner) {
			return NextResponse.json(
				{ error: 'Cannot modify document owner\'s role' },
				{ status: 400 }
			);
		}

		// Parse request body
		const body = await request.json();
		const { permissionLevel } = body;

		// Validate permission level - can only set admin or viewer, not owner
		if (permissionLevel !== AdminPermissionLevel.admin &&
			permissionLevel !== AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Invalid permission level. Only admin or viewer allowed.' },
				{ status: 400 }
			);
		}

		// Get collaborator document
		const collaboratorRef = db
			.collection(Collections.documentCollaborators)
			.doc(docId)
			.collection('collaborators')
			.doc(targetUserId);

		const collaboratorSnap = await collaboratorRef.get();

		if (!collaboratorSnap.exists) {
			return NextResponse.json(
				{ error: 'Collaborator not found' },
				{ status: 404 }
			);
		}

		const collaborator = collaboratorSnap.data() as DocumentCollaborator;

		// Update permission level
		const updatedCollaborator: DocumentCollaborator = {
			...collaborator,
			permissionLevel,
			lastUpdate: Date.now(),
		};

		await collaboratorRef.update({
			permissionLevel,
			lastUpdate: updatedCollaborator.lastUpdate,
		});

		logger.info(`[API] Collaborator ${targetUserId} role changed to ${permissionLevel} by ${currentUserId} on document ${docId}`);

		return NextResponse.json({
			success: true,
			collaborator: updatedCollaborator,
		});
	} catch (error) {
		logger.error('[API] Admin collaborators PATCH failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/admin/collaborators/[docId]/[userId]
 * Remove a collaborator from a document
 * Accessible by owner or admin (but cannot remove owner)
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; userId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, userId: targetUserId } = await params;
		const currentUserId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!currentUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		// Prevent self-removal
		if (currentUserId === targetUserId) {
			return NextResponse.json(
				{ error: 'Cannot remove yourself. Please contact another admin.' },
				{ status: 400 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be owner or admin to remove collaborators
		const accessResult = await checkAdminAccess(db, docId, currentUserId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Only owner and admin can remove collaborators
		if (accessResult.permissionLevel !== AdminPermissionLevel.owner &&
			accessResult.permissionLevel !== AdminPermissionLevel.admin) {
			return NextResponse.json(
				{ error: 'Forbidden - Only owners and admins can remove collaborators' },
				{ status: 403 }
			);
		}

		// Check if target is the owner - cannot remove owner
		const targetAccessResult = await checkAdminAccess(db, docId, targetUserId);

		if (targetAccessResult.isOwner) {
			return NextResponse.json(
				{ error: 'Cannot remove document owner' },
				{ status: 400 }
			);
		}

		// Get collaborator document to verify it exists
		const collaboratorRef = db
			.collection(Collections.documentCollaborators)
			.doc(docId)
			.collection('collaborators')
			.doc(targetUserId);

		const collaboratorSnap = await collaboratorRef.get();

		if (!collaboratorSnap.exists) {
			return NextResponse.json(
				{ error: 'Collaborator not found' },
				{ status: 404 }
			);
		}

		// Delete collaborator
		await collaboratorRef.delete();

		logger.info(`[API] Collaborator ${targetUserId} removed by ${currentUserId} from document ${docId}`);

		return NextResponse.json({
			success: true,
			message: 'Collaborator removed successfully',
		});
	} catch (error) {
		logger.error('[API] Admin collaborators DELETE failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
