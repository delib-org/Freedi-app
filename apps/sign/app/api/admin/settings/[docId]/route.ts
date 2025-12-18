import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { DemographicMode } from '@/types/demographics';
import { TextDirection, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME } from '@/types';
import { logger } from '@/lib/utils/logger';

export interface DocumentSettings {
  allowComments: boolean;
  allowApprovals: boolean;
  requireLogin: boolean;
  showHeatMap: boolean;
  showViewCounts: boolean;
  isPublic: boolean;
  demographicMode: DemographicMode;
  demographicRequired: boolean;
  textDirection: TextDirection;
  logoUrl: string;
  brandName: string;
}

const DEFAULT_SETTINGS: DocumentSettings = {
  allowComments: true,
  allowApprovals: true,
  requireLogin: false,
  showHeatMap: true,
  showViewCounts: true,
  isPublic: true,
  demographicMode: 'disabled',
  demographicRequired: false,
  textDirection: 'auto',
  logoUrl: DEFAULT_LOGO_URL,
  brandName: DEFAULT_BRAND_NAME,
};

/**
 * GET /api/admin/settings/[docId]
 * Returns document settings
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
    const isAdmin = document?.creator?.odlUserId === userId || document?.creatorId === userId;

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get settings from document or use defaults
    const settings: DocumentSettings = {
      allowComments: document?.signSettings?.allowComments ?? DEFAULT_SETTINGS.allowComments,
      allowApprovals: document?.signSettings?.allowApprovals ?? DEFAULT_SETTINGS.allowApprovals,
      requireLogin: document?.signSettings?.requireLogin ?? DEFAULT_SETTINGS.requireLogin,
      showHeatMap: document?.signSettings?.showHeatMap ?? DEFAULT_SETTINGS.showHeatMap,
      showViewCounts: document?.signSettings?.showViewCounts ?? DEFAULT_SETTINGS.showViewCounts,
      isPublic: document?.signSettings?.isPublic ?? DEFAULT_SETTINGS.isPublic,
      demographicMode: document?.signSettings?.demographicMode ?? DEFAULT_SETTINGS.demographicMode,
      demographicRequired: document?.signSettings?.demographicRequired ?? DEFAULT_SETTINGS.demographicRequired,
      textDirection: document?.signSettings?.textDirection ?? DEFAULT_SETTINGS.textDirection,
      logoUrl: document?.signSettings?.logoUrl ?? DEFAULT_SETTINGS.logoUrl,
      brandName: document?.signSettings?.brandName ?? DEFAULT_SETTINGS.brandName,
    };

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('[API] Admin settings GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/settings/[docId]
 * Updates document settings
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
    const isAdmin = document?.creator?.odlUserId === userId || document?.creatorId === userId;

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse and validate settings
    const body = await request.json();

    // Get existing settings to merge with
    const existingSettings = document?.signSettings || {};

    // Validate demographicMode
    const validModes: DemographicMode[] = ['disabled', 'inherit', 'custom'];
    const demographicMode: DemographicMode = validModes.includes(body.demographicMode)
      ? body.demographicMode
      : (existingSettings.demographicMode ?? DEFAULT_SETTINGS.demographicMode);

    // Validate textDirection
    const validDirections: TextDirection[] = ['auto', 'ltr', 'rtl'];
    const textDirection: TextDirection = validDirections.includes(body.textDirection)
      ? body.textDirection
      : (existingSettings.textDirection ?? DEFAULT_SETTINGS.textDirection);

    // Merge settings - only update fields that are provided
    const settings: DocumentSettings = {
      allowComments: body.allowComments !== undefined ? Boolean(body.allowComments) : (existingSettings.allowComments ?? DEFAULT_SETTINGS.allowComments),
      allowApprovals: body.allowApprovals !== undefined ? Boolean(body.allowApprovals) : (existingSettings.allowApprovals ?? DEFAULT_SETTINGS.allowApprovals),
      requireLogin: body.requireLogin !== undefined ? Boolean(body.requireLogin) : (existingSettings.requireLogin ?? DEFAULT_SETTINGS.requireLogin),
      showHeatMap: body.showHeatMap !== undefined ? Boolean(body.showHeatMap) : (existingSettings.showHeatMap ?? DEFAULT_SETTINGS.showHeatMap),
      showViewCounts: body.showViewCounts !== undefined ? Boolean(body.showViewCounts) : (existingSettings.showViewCounts ?? DEFAULT_SETTINGS.showViewCounts),
      isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : (existingSettings.isPublic ?? DEFAULT_SETTINGS.isPublic),
      demographicMode,
      demographicRequired: body.demographicRequired !== undefined ? Boolean(body.demographicRequired) : (existingSettings.demographicRequired ?? DEFAULT_SETTINGS.demographicRequired),
      textDirection,
      logoUrl: body.logoUrl !== undefined ? String(body.logoUrl) : (existingSettings.logoUrl ?? DEFAULT_SETTINGS.logoUrl),
      brandName: body.brandName !== undefined ? String(body.brandName) : (existingSettings.brandName ?? DEFAULT_SETTINGS.brandName),
    };

    // Update document with new settings
    await docRef.update({
      signSettings: settings,
      lastUpdate: Date.now(),
    });

    logger.info(`[API] Settings updated for document ${docId} by user ${userId}`);

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error('[API] Admin settings PUT failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
