import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	IncoherenceRecord,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/versions/[docId]/[versionId]/coherence
 * Fetch coherence records for a specific version
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

		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Fetch coherence records for this version
		const recordsSnapshot = await db
			.collection(Collections.coherenceRecords)
			.where('versionId', '==', versionId)
			.get();

		const records = recordsSnapshot.docs.map(
			(doc) => doc.data() as IncoherenceRecord
		);

		// Get coherence score from the version document
		const versionSnap = await db
			.collection(Collections.documentVersions)
			.doc(versionId)
			.get();

		const versionData = versionSnap.data();
		const coherenceScore = versionData?.coherenceScore as number | undefined;

		logger.info(
			`[Coherence API] Fetched ${records.length} records for version ${versionId}`
		);

		return NextResponse.json({
			records,
			coherenceScore: coherenceScore ?? null,
		});
	} catch (error) {
		logger.error('[Coherence API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
