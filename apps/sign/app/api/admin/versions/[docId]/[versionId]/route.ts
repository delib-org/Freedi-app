import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersion,
	VersionChange,
	VersionStatus,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import * as v from 'valibot';
import { ParagraphSchema } from '@freedi/shared-types';

/**
 * Valibot schema for version update input
 */
const VersionUpdateSchema = v.object({
	paragraphs: v.optional(v.array(ParagraphSchema)),
	summary: v.optional(v.pipe(v.string(), v.maxLength(2000))),
});

/**
 * GET /api/admin/versions/[docId]/[versionId]
 * Get a specific version with its changes
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, versionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Verify version belongs to document
		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		// Get changes for this version
		const changesSnapshot = await db
			.collection(Collections.versionChanges)
			.where('versionId', '==', versionId)
			.orderBy('combinedImpact', 'desc')
			.get();

		const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

		return NextResponse.json({
			version,
			changes,
		});
	} catch (error) {
		logger.error('[Versions API] GET single error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/admin/versions/[docId]/[versionId]
 * Update a version (paragraphs, summary, etc.)
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, versionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Verify version belongs to document
		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		// Only draft versions can be edited
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be edited' },
				{ status: 400 }
			);
		}

		// Parse and validate request body
		let body: v.InferOutput<typeof VersionUpdateSchema>;
		try {
			const rawBody = await request.json();
			body = v.parse(VersionUpdateSchema, rawBody);
		} catch (validationError) {
			const issues = validationError instanceof v.ValiError ? validationError.issues : [];
			return NextResponse.json(
				{
					error: 'Invalid request body',
					details: issues.map((issue: v.BaseIssue<unknown>) => ({
						path: issue.path?.map((p) => String(p.key)).join('.'),
						message: issue.message,
					})),
				},
				{ status: 400 }
			);
		}

		// Build update object - only allow certain fields to be updated
		const updateData: Partial<DocumentVersion> = {};

		if (body.paragraphs !== undefined) {
			updateData.paragraphs = body.paragraphs;
		}

		if (body.summary !== undefined) {
			updateData.summary = body.summary;
		}

		if (Object.keys(updateData).length === 0) {
			return NextResponse.json(
				{ error: 'No valid fields to update' },
				{ status: 400 }
			);
		}

		await versionRef.update(updateData);

		logger.info(`[Versions API] Updated version ${versionId}`);

		// Return updated version
		const updatedVersionSnap = await versionRef.get();
		const updatedVersion = updatedVersionSnap.data() as DocumentVersion;

		return NextResponse.json({
			success: true,
			version: updatedVersion,
		});
	} catch (error) {
		logger.error('[Versions API] PUT error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/admin/versions/[docId]/[versionId]
 * Delete a version (only drafts can be deleted)
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, versionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Verify version belongs to document
		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		// Only draft versions can be deleted
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be deleted. Published versions can only be archived.' },
				{ status: 400 }
			);
		}

		// Delete associated changes first
		const changesSnapshot = await db
			.collection(Collections.versionChanges)
			.where('versionId', '==', versionId)
			.get();

		const batch = db.batch();

		changesSnapshot.docs.forEach((doc) => {
			batch.delete(doc.ref);
		});

		// Delete the version
		batch.delete(versionRef);

		await batch.commit();

		logger.info(`[Versions API] Deleted version ${versionId} with ${changesSnapshot.size} changes`);

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error('[Versions API] DELETE error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
