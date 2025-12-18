import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminInvitation,
	AdminInvitationStatus,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * DELETE /api/admin/invitations/[docId]/[invitationId]
 * Revokes an admin invitation
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; invitationId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, invitationId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be owner to revoke invitations
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isOwner) {
			return NextResponse.json(
				{ error: 'Forbidden - Owner access required to manage invitations' },
				{ status: 403 }
			);
		}

		// Get the invitation
		const invitationRef = db.collection(Collections.adminInvitations).doc(invitationId);
		const invitationSnap = await invitationRef.get();

		if (!invitationSnap.exists) {
			return NextResponse.json(
				{ error: 'Invitation not found' },
				{ status: 404 }
			);
		}

		const invitation = invitationSnap.data() as AdminInvitation;

		// Verify invitation belongs to this document
		if (invitation.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Invitation not found for this document' },
				{ status: 404 }
			);
		}

		// Check if invitation is still pending
		if (invitation.status !== AdminInvitationStatus.pending) {
			return NextResponse.json(
				{ error: `Cannot revoke invitation with status: ${invitation.status}` },
				{ status: 400 }
			);
		}

		// Revoke the invitation
		await invitationRef.update({
			status: AdminInvitationStatus.revoked,
		});

		logger.info(`[API] Admin invitation ${invitationId} revoked by ${userId}`);

		return NextResponse.json({
			success: true,
			message: 'Invitation revoked successfully',
		});
	} catch (error) {
		logger.error('[API] Admin invitations DELETE failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
