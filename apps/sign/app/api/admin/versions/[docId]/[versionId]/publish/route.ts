import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersion,
	VersionStatus,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/admin/versions/[docId]/[versionId]/publish
 * Publish a draft version and optionally apply it to the document
 */
export async function POST(
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

		// Only draft versions can be published
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be published' },
				{ status: 400 }
			);
		}

		const body = await request.json().catch(() => ({}));
		const applyToDocument = body.applyToDocument ?? true;

		const batch = db.batch();
		const now = Date.now();

		// Archive any currently published version
		const publishedSnapshot = await db
			.collection(Collections.documentVersions)
			.where('documentId', '==', docId)
			.where('status', '==', VersionStatus.published)
			.get();

		publishedSnapshot.docs.forEach((doc) => {
			batch.update(doc.ref, { status: VersionStatus.archived });
		});

		// Publish this version
		batch.update(versionRef, {
			status: VersionStatus.published,
			publishedAt: now,
			publishedBy: userId,
		});

		// Optionally apply paragraphs to the main document
		if (applyToDocument && version.paragraphs?.length) {
			const docRef = db.collection(Collections.statements).doc(docId);
			batch.update(docRef, {
				paragraphs: version.paragraphs,
				lastUpdate: now,
			});
		}

		await batch.commit();

		logger.info(`[Versions API] Published version ${versionId}, applied to document: ${applyToDocument}`);

		// Return updated version
		const updatedVersionSnap = await versionRef.get();
		const updatedVersion = updatedVersionSnap.data() as DocumentVersion;

		return NextResponse.json({
			success: true,
			version: updatedVersion,
			appliedToDocument: applyToDocument,
		});
	} catch (error) {
		logger.error('[Versions API] Publish error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
