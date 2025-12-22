import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getUserEmailFromCookie } from '@/lib/utils/user';
import {
	Collections,
	AdminInvitation,
	AdminInvitationStatus,
	DocumentCollaborator,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

interface AcceptedInvitation {
	documentId: string;
	permissionLevel: string;
	invitedBy: string;
}

/**
 * POST /api/auth/accept-pending-invitations
 * Automatically accepts all pending invitations for the logged-in user's email.
 * Called after Google login to grant permissions without requiring invitation links.
 */
export async function POST(
	request: NextRequest
): Promise<NextResponse> {
	try {
		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);
		const userDisplayName = getUserDisplayNameFromCookie(cookieHeader) || 'Unknown';
		const userEmail = getUserEmailFromCookie(cookieHeader);

		// Must be logged in with Google (need email)
		if (!userId || !userEmail) {
			return NextResponse.json({
				success: false,
				message: 'Not logged in with Google account',
				acceptedCount: 0,
			});
		}

		const { db } = getFirebaseAdmin();
		const normalizedEmail = userEmail.toLowerCase();

		// Find all pending invitations for this email
		const invitationsRef = db.collection(Collections.adminInvitations);
		const querySnapshot = await invitationsRef
			.where('invitedEmail', '==', normalizedEmail)
			.where('status', '==', AdminInvitationStatus.pending)
			.get();

		if (querySnapshot.empty) {
			return NextResponse.json({
				success: true,
				message: 'No pending invitations found',
				acceptedCount: 0,
				acceptedInvitations: [],
			});
		}

		const now = Date.now();
		const acceptedInvitations: AcceptedInvitation[] = [];
		const batch = db.batch();
		let batchCount = 0;

		for (const invitationDoc of querySnapshot.docs) {
			const invitation = invitationDoc.data() as AdminInvitation;

			// Skip expired invitations
			if (invitation.expiresAt < now) {
				// Mark as expired
				batch.update(invitationDoc.ref, {
					status: AdminInvitationStatus.expired,
				});
				batchCount++;
				continue;
			}

			// Check if user is already a collaborator on this document
			const collaboratorRef = db
				.collection(Collections.documentCollaborators)
				.doc(invitation.documentId)
				.collection('collaborators')
				.doc(userId);

			// We need to check this outside the batch
			const existingCollaborator = await collaboratorRef.get();
			if (existingCollaborator.exists) {
				// Already a collaborator, skip but mark invitation as accepted
				batch.update(invitationDoc.ref, {
					status: AdminInvitationStatus.accepted,
					acceptedAt: now,
					acceptedByUserId: userId,
					acceptedByDisplayName: userDisplayName,
				});
				batchCount++;
				continue;
			}

			// Create collaborator record
			const collaborator: DocumentCollaborator = {
				documentId: invitation.documentId,
				userId,
				email: normalizedEmail,
				displayName: userDisplayName,
				permissionLevel: invitation.permissionLevel,
				addedAt: now,
				addedBy: invitation.invitedBy,
				lastUpdate: now,
			};

			// Update invitation status
			batch.update(invitationDoc.ref, {
				status: AdminInvitationStatus.accepted,
				acceptedAt: now,
				acceptedByUserId: userId,
				acceptedByDisplayName: userDisplayName,
			});

			// Create collaborator
			batch.set(collaboratorRef, collaborator);
			batchCount += 2;

			acceptedInvitations.push({
				documentId: invitation.documentId,
				permissionLevel: invitation.permissionLevel,
				invitedBy: invitation.invitedByDisplayName || invitation.invitedBy,
			});

			// Firestore batch limit is 500 operations
			if (batchCount >= 490) {
				break;
			}
		}

		if (batchCount > 0) {
			await batch.commit();
		}

		if (acceptedInvitations.length > 0) {
			logger.info(`[API] Auto-accepted ${acceptedInvitations.length} invitations for ${userEmail}`);
		}

		return NextResponse.json({
			success: true,
			message: acceptedInvitations.length > 0
				? `Accepted ${acceptedInvitations.length} pending invitation(s)`
				: 'No pending invitations found',
			acceptedCount: acceptedInvitations.length,
			acceptedInvitations,
		});
	} catch (error) {
		logger.error('[API] Accept pending invitations failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error', acceptedCount: 0 },
			{ status: 500 }
		);
	}
}
