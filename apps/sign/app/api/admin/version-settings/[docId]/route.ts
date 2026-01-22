import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersioningSettings,
	DEFAULT_VERSIONING_SETTINGS,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/version-settings/[docId]
 * Get versioning settings for a document
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

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get settings
		const settingsRef = db.collection(Collections.versioningSettings).doc(docId);
		const settingsSnap = await settingsRef.get();

		if (!settingsSnap.exists) {
			// Return defaults if no settings exist
			const defaultSettings: DocumentVersioningSettings = {
				documentId: docId,
				...DEFAULT_VERSIONING_SETTINGS,
				lastUpdated: 0,
				updatedBy: '',
			};

			return NextResponse.json({ settings: defaultSettings });
		}

		const settings = settingsSnap.data() as DocumentVersioningSettings;

		return NextResponse.json({ settings });
	} catch (error) {
		logger.error('[Version Settings API] GET error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/admin/version-settings/[docId]
 * Update versioning settings for a document
 */
export async function PUT(
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

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		const body = await request.json();

		// Get existing settings or defaults
		const settingsRef = db.collection(Collections.versioningSettings).doc(docId);
		const settingsSnap = await settingsRef.get();

		const existingSettings = settingsSnap.exists
			? (settingsSnap.data() as DocumentVersioningSettings)
			: { ...DEFAULT_VERSIONING_SETTINGS };

		// Validate and merge settings
		const settings: DocumentVersioningSettings = {
			documentId: docId,
			enabled: body.enabled !== undefined ? Boolean(body.enabled) : existingSettings.enabled,
			k1: typeof body.k1 === 'number' && body.k1 > 0 ? body.k1 : existingSettings.k1,
			k2: typeof body.k2 === 'number' && body.k2 > 0 ? body.k2 : existingSettings.k2,
			minImpactThreshold:
				typeof body.minImpactThreshold === 'number' && body.minImpactThreshold >= 0
					? body.minImpactThreshold
					: existingSettings.minImpactThreshold,
			autoGenerateOnThreshold:
				typeof body.autoGenerateOnThreshold === 'number' && body.autoGenerateOnThreshold > 0
					? body.autoGenerateOnThreshold
					: undefined,
			lastUpdated: Date.now(),
			updatedBy: userId,
		};

		await settingsRef.set(settings);

		logger.info(`[Version Settings API] Updated settings for document ${docId}`);

		return NextResponse.json({
			success: true,
			settings,
		});
	} catch (error) {
		logger.error('[Version Settings API] PUT error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
