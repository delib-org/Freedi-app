export const dynamic = 'force-dynamic';

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

/**
 * GET /api/invite/accept?token={token}
 * Accepts an admin invitation after verifying the email matches
 */
export async function GET(
	request: NextRequest
): Promise<NextResponse> {
	try {
		const searchParams = request.nextUrl.searchParams;
		const token = searchParams.get('token');

		if (!token) {
			return NextResponse.json(
				{ error: 'Missing invitation token' },
				{ status: 400 }
			);
		}

		const cookieHeader = request.headers.get('cookie');
		const userId = getUserIdFromCookie(cookieHeader);
		const userDisplayName = getUserDisplayNameFromCookie(cookieHeader) || 'Unknown';
		const userEmail = getUserEmailFromCookie(cookieHeader);

		// DEBUG: Log cookie extraction
		logger.info('[DEBUG] Invite accept - Cookie extraction:', {
			hasUserId: !!userId,
			hasUserEmail: !!userEmail,
			userEmail: userEmail,
			userEmailLower: userEmail?.toLowerCase(),
		});

		// If not logged in, return info to redirect to login
		if (!userId) {
			return NextResponse.json({
				success: false,
				requiresLogin: true,
				message: 'Please log in with Google to accept this invitation',
			});
		}

		// If no email in cookie, user might be logged in anonymously
		if (!userEmail) {
			return NextResponse.json({
				success: false,
				requiresGoogleLogin: true,
				message: 'Please log in with Google (not anonymously) to accept admin invitations',
			});
		}

		const { db } = getFirebaseAdmin();

		// Find the invitation by token
		const invitationsRef = db.collection(Collections.adminInvitations);
		const querySnapshot = await invitationsRef
			.where('token', '==', token)
			.limit(1)
			.get();

		if (querySnapshot.empty) {
			return NextResponse.json(
				{ error: 'Invitation not found or invalid token' },
				{ status: 404 }
			);
		}

		const invitationDoc = querySnapshot.docs[0];
		const invitation = invitationDoc.data() as AdminInvitation;

		// DEBUG: Log invitation data and email comparison
		logger.info('[DEBUG] Invite accept - Email comparison:', {
			invitedEmail: invitation.invitedEmail,
			invitedEmailLower: invitation.invitedEmail.toLowerCase(),
			userEmail: userEmail,
			userEmailLower: userEmail?.toLowerCase(),
			emailsMatch: userEmail?.toLowerCase() === invitation.invitedEmail.toLowerCase(),
			invitationStatus: invitation.status,
			documentId: invitation.documentId,
		});

		// Check invitation status
		if (invitation.status !== AdminInvitationStatus.pending) {
			return NextResponse.json({
				success: false,
				error: `This invitation has already been ${invitation.status}`,
			}, { status: 400 });
		}

		// Check if expired
		if (invitation.expiresAt < Date.now()) {
			// Update status to expired
			await invitationDoc.ref.update({
				status: AdminInvitationStatus.expired,
			});

			return NextResponse.json({
				success: false,
				error: 'This invitation has expired. Please ask the document owner for a new invitation.',
			}, { status: 410 });
		}

		// Verify email matches (case-insensitive)
		if (userEmail.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
			return NextResponse.json({
				success: false,
				error: 'Email mismatch',
				message: `This invitation was sent to ${invitation.invitedEmail}. You are logged in with ${userEmail}. Please log in with the correct Google account.`,
				expectedEmail: invitation.invitedEmail,
				actualEmail: userEmail,
			}, { status: 403 });
		}

		// Check if user is already a collaborator
		const collaboratorRef = db
			.collection(Collections.documentCollaborators)
			.doc(invitation.documentId)
			.collection('collaborators')
			.doc(userId);
		const existingCollaborator = await collaboratorRef.get();

		if (existingCollaborator.exists) {
			return NextResponse.json({
				success: false,
				error: 'You are already a collaborator on this document',
				documentId: invitation.documentId,
			}, { status: 409 });
		}

		// Create collaborator record
		const now = Date.now();
		const collaborator: DocumentCollaborator = {
			documentId: invitation.documentId,
			userId,
			email: userEmail.toLowerCase(),
			displayName: userDisplayName,
			permissionLevel: invitation.permissionLevel,
			addedAt: now,
			addedBy: invitation.invitedBy,
			lastUpdate: now,
		};

		// Use a batch to atomically update both invitation and create collaborator
		const batch = db.batch();

		// Update invitation status
		batch.update(invitationDoc.ref, {
			status: AdminInvitationStatus.accepted,
			acceptedAt: now,
			acceptedByUserId: userId,
			acceptedByDisplayName: userDisplayName,
		});

		// Create collaborator
		batch.set(collaboratorRef, collaborator);

		await batch.commit();

		logger.info(`[API] Invitation accepted: ${userEmail} is now ${invitation.permissionLevel} on document ${invitation.documentId}`);

		return NextResponse.json({
			success: true,
			message: 'Invitation accepted successfully',
			documentId: invitation.documentId,
			permissionLevel: invitation.permissionLevel,
			redirectUrl: `/doc/${invitation.documentId}/admin`,
		});
	} catch (error) {
		logger.error('[API] Invite accept failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
