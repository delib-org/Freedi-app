import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersion,
	VersionStatus,
	getVersionId,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { QUERY_LIMITS, VERSIONING } from '@/constants/common';

/**
 * GET /api/admin/versions/[docId]
 * Get all versions for a document (admin only)
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

		// Check admin access
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get versions for document
		const versionsSnapshot = await db
			.collection(Collections.documentVersions)
			.where('documentId', '==', docId)
			.orderBy('versionNumber', 'desc')
			.limit(VERSIONING.MAX_VERSIONS)
			.get();

		const versions = versionsSnapshot.docs.map((doc) => doc.data() as DocumentVersion);

		return NextResponse.json({ versions });
	} catch (error) {
		logger.error('[Versions API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/admin/versions/[docId]
 * Create a new version (draft) for a document
 */
export async function POST(
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

		// Check admin access - must be admin or owner (not viewer)
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the document
		const docRef = db.collection(Collections.statements).doc(docId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		const document = docSnap.data();
		const paragraphs = document?.paragraphs || [];

		// Get current highest version number
		const versionsSnapshot = await db
			.collection(Collections.documentVersions)
			.where('documentId', '==', docId)
			.orderBy('versionNumber', 'desc')
			.limit(1)
			.get();

		const highestVersion = versionsSnapshot.empty
			? 0
			: (versionsSnapshot.docs[0].data() as DocumentVersion).versionNumber;

		const newVersionNumber = highestVersion + 1;
		const versionId = getVersionId(docId, newVersionNumber);

		// Create the new version as a draft with current document content
		const newVersion: DocumentVersion = {
			versionId,
			documentId: docId,
			versionNumber: newVersionNumber,
			paragraphs, // Snapshot of current paragraphs
			status: VersionStatus.draft,
			createdAt: Date.now(),
			createdBy: userId,
			aiGenerated: false,
		};

		await db.collection(Collections.documentVersions).doc(versionId).set(newVersion);

		logger.info(`[Versions API] Created version ${versionId} for document ${docId}`);

		return NextResponse.json({
			success: true,
			version: newVersion,
		});
	} catch (error) {
		logger.error('[Versions API] POST error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
