import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections, Statement, AuditAction } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import {
	verifyAdmin,
	validateVersionControlSettings,
	logAudit,
} from '@/lib/utils/versionControlHelpers';

/**
 * Version Control Settings Interface
 */
export interface VersionControlSettings {
	enabled: boolean;
	reviewThreshold: number;
	allowAdminEdit: boolean;
	enableVersionHistory: boolean;
	maxRecentVersions: number;
	maxTotalVersions: number;
	lastSettingsUpdate?: number;
	updatedBy?: string;
}

/**
 * Default version control settings
 */
const DEFAULT_SETTINGS: VersionControlSettings = {
	enabled: false,
	reviewThreshold: 0.5,
	allowAdminEdit: true,
	enableVersionHistory: true,
	maxRecentVersions: 4,
	maxTotalVersions: 50,
};

/**
 * GET /api/admin/version-control/[documentId]/settings
 * Fetch version control settings for a document
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
): Promise<NextResponse> {
	try {
		const { documentId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		// Verify admin access
		const db = getFirestoreAdmin();
		await verifyAdmin(db, documentId, userId);

		// Get document
		const docRef = db.collection(Collections.statements).doc(documentId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json({ error: 'Document not found' }, { status: 404 });
		}

		const document = docSnap.data() as Statement;

		// Extract settings or use defaults
		const settings: VersionControlSettings = {
			enabled: document.doc?.versionControlSettings?.enabled ?? DEFAULT_SETTINGS.enabled,
			reviewThreshold:
				document.doc?.versionControlSettings?.reviewThreshold ??
				DEFAULT_SETTINGS.reviewThreshold,
			allowAdminEdit:
				document.doc?.versionControlSettings?.allowAdminEdit ??
				DEFAULT_SETTINGS.allowAdminEdit,
			enableVersionHistory:
				document.doc?.versionControlSettings?.enableVersionHistory ??
				DEFAULT_SETTINGS.enableVersionHistory,
			maxRecentVersions:
				document.doc?.versionControlSettings?.maxRecentVersions ??
				DEFAULT_SETTINGS.maxRecentVersions,
			maxTotalVersions:
				document.doc?.versionControlSettings?.maxTotalVersions ??
				DEFAULT_SETTINGS.maxTotalVersions,
			lastSettingsUpdate: document.doc?.versionControlSettings?.lastSettingsUpdate,
			updatedBy: document.doc?.versionControlSettings?.updatedBy,
		};

		return NextResponse.json({ success: true, settings });
	} catch (error) {
		logger.error('[Version Control Settings API] GET error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('not an admin')) {
				return NextResponse.json(
					{ error: 'Forbidden - Admin access required' },
					{ status: 403 }
				);
			}
			if (error.message.includes('Viewer permission')) {
				return NextResponse.json(
					{ error: 'Forbidden - Viewers cannot access settings' },
					{ status: 403 }
				);
			}
		}

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * PUT /api/admin/version-control/[documentId]/settings
 * Update version control settings for a document
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
): Promise<NextResponse> {
	try {
		const { documentId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		// Verify admin access
		const db = getFirestoreAdmin();
		await verifyAdmin(db, documentId, userId);

		// Parse request body
		const body = await request.json();
		const {
			enabled,
			reviewThreshold,
			allowAdminEdit,
			enableVersionHistory,
			maxRecentVersions,
			maxTotalVersions,
			consensusSettings,
		} = body;

		// Validate settings
		validateVersionControlSettings({
			reviewThreshold,
			maxRecentVersions,
			maxTotalVersions,
		});

		// Validate consensus settings if provided
		if (consensusSettings) {
			const { removalThreshold, additionThreshold, minEvaluators } = consensusSettings;
			if (removalThreshold !== undefined && (removalThreshold < -1 || removalThreshold > 0)) {
				return NextResponse.json({ error: 'removalThreshold must be between -1 and 0' }, { status: 400 });
			}
			if (additionThreshold !== undefined && (additionThreshold < 0 || additionThreshold > 1)) {
				return NextResponse.json({ error: 'additionThreshold must be between 0 and 1' }, { status: 400 });
			}
			if (minEvaluators !== undefined && (minEvaluators < 1 || !Number.isInteger(minEvaluators))) {
				return NextResponse.json({ error: 'minEvaluators must be a positive integer' }, { status: 400 });
			}
		}

		// Prepare update object
		const settingsUpdate: Record<string, unknown> = {
			'doc.versionControlSettings': {
				enabled: enabled ?? DEFAULT_SETTINGS.enabled,
				reviewThreshold: reviewThreshold ?? DEFAULT_SETTINGS.reviewThreshold,
				allowAdminEdit: allowAdminEdit ?? DEFAULT_SETTINGS.allowAdminEdit,
				enableVersionHistory: enableVersionHistory ?? DEFAULT_SETTINGS.enableVersionHistory,
				maxRecentVersions: maxRecentVersions ?? DEFAULT_SETTINGS.maxRecentVersions,
				maxTotalVersions: maxTotalVersions ?? DEFAULT_SETTINGS.maxTotalVersions,
				...(consensusSettings && { consensusSettings }),
				lastSettingsUpdate: Date.now(),
				updatedBy: userId,
			},
		};

		// Update document
		const docRef = db.collection(Collections.statements).doc(documentId);
		await docRef.update(settingsUpdate);

		// Log audit trail
		await logAudit(db, {
			documentId,
			userId: userId!,
			action: AuditAction.settings_changed,
			metadata: {
				newValue: JSON.stringify(body),
			},
		});

		logger.info('[Version Control Settings API] Settings updated', {
			documentId,
			userId,
			enabled,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error('[Version Control Settings API] PUT error:', error);

		if (error instanceof Error) {
			if (error.message.includes('not authenticated')) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}
			if (error.message.includes('not an admin')) {
				return NextResponse.json(
					{ error: 'Forbidden - Admin access required' },
					{ status: 403 }
				);
			}
			if (error.message.includes('Viewer permission')) {
				return NextResponse.json(
					{ error: 'Forbidden - Viewers cannot modify settings' },
					{ status: 403 }
				);
			}
			if (
				error.message.includes('must be between') ||
				error.message.includes('must be >=')
			) {
				return NextResponse.json({ error: error.message }, { status: 400 });
			}
		}

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
