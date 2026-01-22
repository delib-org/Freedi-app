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
import { logError } from '@/lib/utils/errorHandling';

/**
 * Firebase Function URL for AI processing
 * Uses Firebase Functions for longer timeout (540s vs Vercel's 30s)
 */
const FIREBASE_FUNCTION_URL =
	process.env.FIREBASE_FUNCTIONS_URL ||
	'https://us-central1-delib-v3-dev.cloudfunctions.net';

/**
 * POST /api/admin/versions/[docId]/[versionId]/process-ai
 * Process changes through AI to generate proposed content
 * Delegates to Firebase Function for longer timeout
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

		// Check admin access
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version to verify it exists and is in draft status
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can be processed' },
				{ status: 400 }
			);
		}

		// Call Firebase Function for AI processing (has 540s timeout vs Vercel's 30s)
		logger.info(`[Process AI] Calling Firebase Function for version ${versionId}`);

		const functionUrl = `${FIREBASE_FUNCTION_URL}/processVersionAI`;

		const response = await fetch(functionUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				versionId,
				documentId: docId,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
			logger.error(`[Process AI] Firebase Function error: ${response.status}`, errorData);

			return NextResponse.json(
				{ error: errorData.error || 'AI processing failed' },
				{ status: response.status }
			);
		}

		const result = await response.json();

		logger.info(`[Process AI] Completed AI processing for version ${versionId}`);

		return NextResponse.json({
			success: true,
			summary: `Version generated with ${result.processedChanges} AI-processed changes.`,
			processedChanges: result.processedChanges,
			totalChanges: result.totalChanges,
		});
	} catch (error) {
		const { docId, versionId } = await params;
		logError(error, {
			operation: 'api.versions.processAI',
			documentId: docId,
			metadata: { versionId },
		});

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
