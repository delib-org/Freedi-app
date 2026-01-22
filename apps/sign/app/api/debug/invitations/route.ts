import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Collections, AdminInvitation } from '@freedi/shared-types';

/**
 * GET /api/debug/invitations?email=xxx
 * Debug endpoint to check invitation status for an email
 * TODO: Remove this endpoint after debugging
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	const searchParams = request.nextUrl.searchParams;
	const email = searchParams.get('email');

	if (!email) {
		return NextResponse.json({ error: 'Email parameter required' }, { status: 400 });
	}

	try {
		const { db } = getFirebaseAdmin();
		const normalizedEmail = email.toLowerCase();

		// Find all invitations for this email (any status)
		const invitationsRef = db.collection(Collections.adminInvitations);
		const querySnapshot = await invitationsRef
			.where('invitedEmail', '==', normalizedEmail)
			.limit(20)
			.get();

		const invitations = querySnapshot.docs.map(doc => {
			const data = doc.data() as AdminInvitation;
			return {
				invitationId: data.invitationId,
				documentId: data.documentId,
				invitedEmail: data.invitedEmail,
				status: data.status,
				permissionLevel: data.permissionLevel,
				createdAt: new Date(data.createdAt).toISOString(),
				expiresAt: new Date(data.expiresAt).toISOString(),
				isExpired: data.expiresAt < Date.now(),
				acceptedAt: data.acceptedAt ? new Date(data.acceptedAt).toISOString() : null,
				acceptedByUserId: data.acceptedByUserId,
			};
		});

		// Also check collaborators collection for this email
		// We need to search across all documents, so let's use collectionGroup
		let collaborators: Array<{
			documentId: string;
			userId: string;
			email: string;
			permissionLevel: string;
			addedAt: string;
		}> = [];

		try {
			const collaboratorsQuery = await db
				.collectionGroup('collaborators')
				.where('email', '==', normalizedEmail)
				.limit(20)
				.get();

			collaborators = collaboratorsQuery.docs.map(doc => {
				const data = doc.data();
				return {
					documentId: data.documentId,
					userId: data.userId,
					email: data.email,
					permissionLevel: data.permissionLevel,
					addedAt: new Date(data.addedAt).toISOString(),
				};
			});
		} catch (collabError) {
			console.error('[DEBUG] Collaborators query failed (may need index):', collabError);
		}

		return NextResponse.json({
			searchedEmail: normalizedEmail,
			invitationsFound: invitations.length,
			invitations,
			collaboratorsFound: collaborators.length,
			collaborators,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('[DEBUG] Error:', error);
		return NextResponse.json({
			error: 'Failed to query',
			details: error instanceof Error ? error.message : String(error)
		}, { status: 500 });
	}
}
