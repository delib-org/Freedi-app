import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie } from '@/lib/utils/user';
import { checkAdminAccess, generateSecureToken } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminInvitation,
	AdminInvitationStatus,
	AdminPermissionLevel,
	INVITATION_EXPIRY,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/invitations/[docId]
 * Returns list of pending and recent admin invitations for a document
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be at least admin level (not viewer) to view invitations
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required to manage invitations' },
				{ status: 403 }
			);
		}

		// Get invitations for this document
		const invitationsRef = db.collection(Collections.adminInvitations);
		const snapshot = await invitationsRef
			.where('documentId', '==', docId)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const invitations: AdminInvitation[] = snapshot.docs.map(doc => doc.data() as AdminInvitation);

		// Filter: show pending invitations and recently accepted/expired (last 7 days)
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const filteredInvitations = invitations.filter(inv =>
			inv.status === AdminInvitationStatus.pending ||
			(inv.acceptedAt && inv.acceptedAt > sevenDaysAgo) ||
			(inv.expiresAt > sevenDaysAgo && inv.status !== AdminInvitationStatus.revoked)
		);

		return NextResponse.json({ invitations: filteredInvitations });
	} catch (error) {
		logger.error('[API] Admin invitations GET failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/admin/invitations/[docId]
 * Creates a new admin invitation
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));
		const userDisplayName = getUserDisplayNameFromCookie(request.headers.get('cookie')) || 'Unknown';

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be at least admin level (not viewer) to create invitations
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required to send invitations' },
				{ status: 403 }
			);
		}

		// Parse request body
		const body = await request.json();
		const { email, permissionLevel: requestedPermission } = body;

		// Validate email
		if (!email || typeof email !== 'string' || !email.includes('@')) {
			return NextResponse.json(
				{ error: 'Invalid email address' },
				{ status: 400 }
			);
		}

		// Determine the effective permission level:
		// - Owners can invite admins or viewers
		// - Non-owner admins can only invite viewers
		let effectivePermission: AdminPermissionLevel;
		if (accessResult.isOwner) {
			// Owners can invite admin or viewer
			if (requestedPermission === AdminPermissionLevel.admin || requestedPermission === AdminPermissionLevel.viewer) {
				effectivePermission = requestedPermission;
			} else {
				return NextResponse.json(
					{ error: 'Invalid permission level. Only admin or viewer invitations are allowed.' },
					{ status: 400 }
				);
			}
		} else {
			// Non-owner admins can only invite viewers
			effectivePermission = AdminPermissionLevel.viewer;
		}

		// Check if there's already a pending invitation for this email
		const existingRef = db.collection(Collections.adminInvitations);
		const existingSnapshot = await existingRef
			.where('documentId', '==', docId)
			.where('invitedEmail', '==', email.toLowerCase())
			.where('status', '==', AdminInvitationStatus.pending)
			.limit(1)
			.get();

		if (!existingSnapshot.empty) {
			return NextResponse.json(
				{ error: 'An invitation for this email is already pending' },
				{ status: 409 }
			);
		}

		// Check rate limit - max 10 pending invitations per document
		const pendingSnapshot = await existingRef
			.where('documentId', '==', docId)
			.where('status', '==', AdminInvitationStatus.pending)
			.get();

		if (pendingSnapshot.size >= 10) {
			return NextResponse.json(
				{ error: 'Maximum pending invitations limit reached (10)' },
				{ status: 429 }
			);
		}

		// Generate invitation
		const invitationId = db.collection(Collections.adminInvitations).doc().id;
		const token = generateSecureToken();
		const now = Date.now();

		const invitation: AdminInvitation = {
			invitationId,
			documentId: docId,
			invitedEmail: email.toLowerCase(),
			invitedBy: userId,
			invitedByDisplayName: userDisplayName,
			permissionLevel: effectivePermission,
			token,
			status: AdminInvitationStatus.pending,
			createdAt: now,
			expiresAt: now + INVITATION_EXPIRY.ADMIN_INVITATION,
			acceptedAt: null,
			acceptedByUserId: null,
			acceptedByDisplayName: null,
		};

		// DEBUG: Log invitation being created
		logger.info('[DEBUG] Creating invitation:', {
			invitationId,
			documentId: docId,
			originalEmail: email,
			storedEmail: email.toLowerCase(),
			permissionLevel: effectivePermission,
			invitedBy: userId,
		});

		// Save invitation
		await db.collection(Collections.adminInvitations).doc(invitationId).set(invitation);

		// Generate invite link
		const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || '';
		const inviteLink = `${baseUrl}/invite?token=${token}`;

		logger.info(`[API] Admin invitation created for ${email} by ${userId} on document ${docId}`);

		return NextResponse.json({
			success: true,
			invitationId,
			inviteLink,
			expiresAt: invitation.expiresAt,
		});
	} catch (error) {
		logger.error('[API] Admin invitations POST failed:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
