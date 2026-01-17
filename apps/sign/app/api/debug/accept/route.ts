import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getUserEmailFromCookie } from '@/lib/utils/user';
import {
	Collections,
	AdminInvitation,
	AdminInvitationStatus,
	DocumentCollaborator,
} from '@freedi/shared-types';

/**
 * GET /api/debug/accept
 * Debug endpoint to manually accept pending invitations
 * Shows what's happening step by step
 * TODO: Remove after debugging
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	const cookieHeader = request.headers.get('cookie');
	const userId = getUserIdFromCookie(cookieHeader);
	const userDisplayName = getUserDisplayNameFromCookie(cookieHeader) || 'Unknown';
	const userEmail = getUserEmailFromCookie(cookieHeader);

	const debugInfo: Record<string, unknown> = {
		step1_cookieExtraction: {
			hasUserId: !!userId,
			userId: userId,
			hasUserEmail: !!userEmail,
			userEmail: userEmail,
			userEmailLower: userEmail?.toLowerCase(),
			userDisplayName: userDisplayName,
		},
	};

	if (!userId || !userEmail) {
		return NextResponse.json({
			error: 'Not logged in with Google account',
			debugInfo,
		}, { status: 401 });
	}

	try {
		const { db } = getFirebaseAdmin();
		const normalizedEmail = userEmail.toLowerCase();

		debugInfo.step2_normalizedEmail = normalizedEmail;

		// Find all pending invitations for this email
		const invitationsRef = db.collection(Collections.adminInvitations);
		const querySnapshot = await invitationsRef
			.where('invitedEmail', '==', normalizedEmail)
			.where('status', '==', AdminInvitationStatus.pending)
			.get();

		debugInfo.step3_queryResults = {
			foundCount: querySnapshot.size,
			invitations: querySnapshot.docs.map(doc => {
				const data = doc.data() as AdminInvitation;
				return {
					invitationId: data.invitationId,
					documentId: data.documentId,
					invitedEmail: data.invitedEmail,
					status: data.status,
					expiresAt: new Date(data.expiresAt).toISOString(),
					isExpired: data.expiresAt < Date.now(),
				};
			}),
		};

		if (querySnapshot.empty) {
			return NextResponse.json({
				success: true,
				message: 'No pending invitations found for your email',
				debugInfo,
			});
		}

		// Try to accept each invitation
		const results: Array<{ documentId: string; success: boolean; error?: string }> = [];
		const now = Date.now();

		for (const invitationDoc of querySnapshot.docs) {
			const invitation = invitationDoc.data() as AdminInvitation;

			try {
				// Skip expired
				if (invitation.expiresAt < now) {
					results.push({
						documentId: invitation.documentId,
						success: false,
						error: 'Invitation expired',
					});
					continue;
				}

				// Check if already a collaborator
				const collaboratorRef = db
					.collection(Collections.documentCollaborators)
					.doc(invitation.documentId)
					.collection('collaborators')
					.doc(userId);

				const existingCollaborator = await collaboratorRef.get();
				if (existingCollaborator.exists) {
					results.push({
						documentId: invitation.documentId,
						success: false,
						error: 'Already a collaborator',
					});
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

				// Use batch to update both
				const batch = db.batch();
				batch.update(invitationDoc.ref, {
					status: AdminInvitationStatus.accepted,
					acceptedAt: now,
					acceptedByUserId: userId,
					acceptedByDisplayName: userDisplayName,
				});
				batch.set(collaboratorRef, collaborator);
				await batch.commit();

				results.push({
					documentId: invitation.documentId,
					success: true,
				});
			} catch (invError) {
				results.push({
					documentId: invitation.documentId,
					success: false,
					error: invError instanceof Error ? invError.message : String(invError),
				});
			}
		}

		debugInfo.step4_acceptResults = results;

		return NextResponse.json({
			success: true,
			message: `Processed ${results.length} invitation(s)`,
			acceptedCount: results.filter(r => r.success).length,
			results,
			debugInfo,
		});
	} catch (error) {
		return NextResponse.json({
			error: 'Failed',
			details: error instanceof Error ? error.message : String(error),
			debugInfo,
		}, { status: 500 });
	}
}
