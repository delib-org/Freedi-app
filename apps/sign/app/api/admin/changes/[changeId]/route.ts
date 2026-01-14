import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	VersionChange,
	DocumentVersion,
	ChangeDecision,
	VersionStatus,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { VERSIONING } from '@/constants/common';

interface UpdateChangeInput {
	adminDecision: ChangeDecision;
	finalContent?: string;
	adminNote?: string;
}

/**
 * GET /api/admin/changes/[changeId]
 * Get a specific change
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ changeId: string }> }
): Promise<NextResponse> {
	try {
		const { changeId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Get the change
		const changeRef = db.collection(Collections.versionChanges).doc(changeId);
		const changeSnap = await changeRef.get();

		if (!changeSnap.exists) {
			return NextResponse.json(
				{ error: 'Change not found' },
				{ status: 404 }
			);
		}

		const change = changeSnap.data() as VersionChange;

		// Get the version to find the document ID
		const versionRef = db.collection(Collections.documentVersions).doc(change.versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Check admin access
		const accessResult = await checkAdminAccess(db, version.documentId, userId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		return NextResponse.json({ change });
	} catch (error) {
		logger.error('[Changes API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/admin/changes/[changeId]
 * Update admin decision on a change
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ changeId: string }> }
): Promise<NextResponse> {
	try {
		const { changeId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Get the change
		const changeRef = db.collection(Collections.versionChanges).doc(changeId);
		const changeSnap = await changeRef.get();

		if (!changeSnap.exists) {
			return NextResponse.json(
				{ error: 'Change not found' },
				{ status: 404 }
			);
		}

		const change = changeSnap.data() as VersionChange;

		// Get the version to find the document ID and check status
		const versionRef = db.collection(Collections.documentVersions).doc(change.versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Only allow changes to draft versions
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Cannot modify changes for non-draft versions' },
				{ status: 400 }
			);
		}

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, version.documentId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		const body: UpdateChangeInput = await request.json();

		// Validate decision
		const validDecisions = Object.values(ChangeDecision);
		if (!validDecisions.includes(body.adminDecision)) {
			return NextResponse.json(
				{ error: 'Invalid admin decision' },
				{ status: 400 }
			);
		}

		// Build update object
		const updateData: Partial<VersionChange> = {
			adminDecision: body.adminDecision,
			adminModifiedAt: Date.now(),
			adminModifiedBy: userId,
		};

		// If modified, require finalContent
		if (body.adminDecision === ChangeDecision.modified) {
			if (!body.finalContent || body.finalContent.trim().length === 0) {
				return NextResponse.json(
					{ error: 'finalContent is required when decision is "modified"' },
					{ status: 400 }
				);
			}
			updateData.finalContent = body.finalContent.trim();
		}

		// If approved, set finalContent to proposedContent
		if (body.adminDecision === ChangeDecision.approved) {
			updateData.finalContent = change.proposedContent;
		}

		// Optional admin note
		if (body.adminNote !== undefined) {
			if (body.adminNote.length > VERSIONING.MAX_AI_REASONING_LENGTH) {
				return NextResponse.json(
					{ error: `Admin note must not exceed ${VERSIONING.MAX_AI_REASONING_LENGTH} characters` },
					{ status: 400 }
				);
			}
			updateData.adminNote = body.adminNote;
		}

		await changeRef.update(updateData);

		logger.info(`[Changes API] Updated change ${changeId} with decision ${body.adminDecision}`);

		// Return updated change
		const updatedChangeSnap = await changeRef.get();
		const updatedChange = updatedChangeSnap.data() as VersionChange;

		return NextResponse.json({
			success: true,
			change: updatedChange,
		});
	} catch (error) {
		logger.error('[Changes API] PUT error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
