import { NextRequest, NextResponse } from 'next/server';
import { denyWithoutDocumentAccess, getParticipantIdentity } from '@/lib/auth/requestIdentity';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import {
	Collections,
	DocumentVersion,
	VersionStatus,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { VERSIONING } from '@/constants/common';

/**
 * GET /api/versions/[docId]
 * Get published versions for a document (public access)
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;

		const db = getFirestoreAdmin();

		// Verify document exists
		const docRef = db.collection(Collections.statements).doc(docId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		const denied = await denyWithoutDocumentAccess(db, docId, await getParticipantIdentity(request), docSnap.data());
		if (denied) return denied;

		// Get all published and archived versions (not drafts)
		const versionsSnapshot = await db
			.collection(Collections.documentVersions)
			.where('documentId', '==', docId)
			.where('status', 'in', [VersionStatus.published, VersionStatus.archived])
			.orderBy('versionNumber', 'desc')
			.limit(VERSIONING.MAX_VERSIONS)
			.get();

		const versions = versionsSnapshot.docs.map((doc) => {
			const version = doc.data() as DocumentVersion;

			// Return a sanitized version for public consumption
			return {
				versionId: version.versionId,
				documentId: version.documentId,
				versionNumber: version.versionNumber,
				status: version.status,
				createdAt: version.createdAt,
				publishedAt: version.publishedAt,
				aiGenerated: version.aiGenerated,
				summary: version.summary,
				changesCount: version.changesCount,
				// Don't expose: paragraphs (use separate endpoint), createdBy, publishedBy, generationSettings
			};
		});

		// Get the current published version number
		const currentVersion = versions.find(v => v.status === VersionStatus.published);

		return NextResponse.json({
			versions,
			currentVersionNumber: currentVersion?.versionNumber || 1,
			totalVersions: versions.length,
		});
	} catch (error) {
		logger.error('[Public Versions API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
