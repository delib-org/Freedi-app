import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, AdminPermissionLevel } from '@freedi/shared-types';
import { DemographicMode, SurveyTriggerMode } from '@/types/demographics';
import { TextDirection, TocPosition, ExplanationVideoMode, DEFAULT_LOGO_URL, DEFAULT_BRAND_NAME, HeaderColors, DEFAULT_HEADER_COLORS } from '@/types';
import { logger } from '@/lib/utils/logger';

export interface DocumentSettings {
  allowComments: boolean;
  allowApprovals: boolean;
  enableSuggestions: boolean;
  requireLogin: boolean;
  showHeatMap: boolean;
  showViewCounts: boolean;
  isPublic: boolean;
  demographicMode: DemographicMode;
  demographicRequired: boolean;
  surveyTrigger: SurveyTriggerMode;
  textDirection: TextDirection;
  defaultLanguage: string;
  forceLanguage: boolean;
  logoUrl: string;
  brandName: string;
  tocEnabled: boolean;
  tocMaxLevel: number;
  tocPosition: TocPosition;
  explanationVideoUrl: string;
  explanationVideoMode: ExplanationVideoMode;
  /** When true, shows ghosted interaction buttons always (for elderly users) */
  enhancedVisibility: boolean;
  /** When false, headers (h1-h6) won't show interaction buttons */
  allowHeaderReactions: boolean;
  /** Custom colors for each heading level */
  headerColors: HeaderColors;
  /** When true, automatically numbers headings hierarchically (1, 1.1, 1.1.1, etc.) */
  enableHeadingNumbering: boolean;
}

const DEFAULT_SETTINGS: DocumentSettings = {
  allowComments: true,
  allowApprovals: true,
  enableSuggestions: false,
  requireLogin: false,
  showHeatMap: true,
  showViewCounts: true,
  isPublic: true,
  demographicMode: 'disabled',
  demographicRequired: false,
  surveyTrigger: 'on_interaction',
  textDirection: 'auto',
  defaultLanguage: '',
  forceLanguage: true,
  logoUrl: DEFAULT_LOGO_URL,
  brandName: DEFAULT_BRAND_NAME,
  tocEnabled: false,
  tocMaxLevel: 2,
  tocPosition: 'auto',
  explanationVideoUrl: '',
  explanationVideoMode: 'optional',
  enhancedVisibility: false,
  allowHeaderReactions: false,
  headerColors: DEFAULT_HEADER_COLORS,
  enableHeadingNumbering: false,
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

    // Check admin access - must be at least admin level (not viewer) to view settings
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

    // Get settings from document or use defaults
    const settings: DocumentSettings = {
      allowComments: document?.signSettings?.allowComments ?? DEFAULT_SETTINGS.allowComments,
      allowApprovals: document?.signSettings?.allowApprovals ?? DEFAULT_SETTINGS.allowApprovals,
      enableSuggestions: document?.signSettings?.enableSuggestions ?? DEFAULT_SETTINGS.enableSuggestions,
      requireLogin: document?.signSettings?.requireLogin ?? DEFAULT_SETTINGS.requireLogin,
      showHeatMap: document?.signSettings?.showHeatMap ?? DEFAULT_SETTINGS.showHeatMap,
      showViewCounts: document?.signSettings?.showViewCounts ?? DEFAULT_SETTINGS.showViewCounts,
      isPublic: document?.signSettings?.isPublic ?? DEFAULT_SETTINGS.isPublic,
      demographicMode: document?.signSettings?.demographicMode ?? DEFAULT_SETTINGS.demographicMode,
      demographicRequired: document?.signSettings?.demographicRequired ?? DEFAULT_SETTINGS.demographicRequired,
      surveyTrigger: document?.signSettings?.surveyTrigger ?? DEFAULT_SETTINGS.surveyTrigger,
      textDirection: document?.signSettings?.textDirection ?? DEFAULT_SETTINGS.textDirection,
      defaultLanguage: document?.signSettings?.defaultLanguage ?? DEFAULT_SETTINGS.defaultLanguage,
      forceLanguage: document?.signSettings?.forceLanguage ?? DEFAULT_SETTINGS.forceLanguage,
      logoUrl: document?.signSettings?.logoUrl ?? DEFAULT_SETTINGS.logoUrl,
      brandName: document?.signSettings?.brandName ?? DEFAULT_SETTINGS.brandName,
      tocEnabled: document?.signSettings?.tocEnabled ?? DEFAULT_SETTINGS.tocEnabled,
      tocMaxLevel: document?.signSettings?.tocMaxLevel ?? DEFAULT_SETTINGS.tocMaxLevel,
      tocPosition: document?.signSettings?.tocPosition ?? DEFAULT_SETTINGS.tocPosition,
      explanationVideoUrl: document?.signSettings?.explanationVideoUrl ?? DEFAULT_SETTINGS.explanationVideoUrl,
      explanationVideoMode: document?.signSettings?.explanationVideoMode ?? DEFAULT_SETTINGS.explanationVideoMode,
      enhancedVisibility: document?.signSettings?.enhancedVisibility ?? DEFAULT_SETTINGS.enhancedVisibility,
      allowHeaderReactions: document?.signSettings?.allowHeaderReactions ?? DEFAULT_SETTINGS.allowHeaderReactions,
      headerColors: document?.signSettings?.headerColors ?? DEFAULT_SETTINGS.headerColors,
      enableHeadingNumbering: document?.signSettings?.enableHeadingNumbering ?? DEFAULT_SETTINGS.enableHeadingNumbering,
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

    // Check admin access - must be at least admin level (not viewer) to update settings
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

    // Parse and validate settings
    const body = await request.json();

    // Get existing settings to merge with
    const existingSettings = document?.signSettings || {};

    // Validate demographicMode
    const validModes: DemographicMode[] = ['disabled', 'inherit', 'custom'];
    const demographicMode: DemographicMode = validModes.includes(body.demographicMode)
      ? body.demographicMode
      : (existingSettings.demographicMode ?? DEFAULT_SETTINGS.demographicMode);

    // Validate surveyTrigger
    const validTriggers: SurveyTriggerMode[] = ['on_interaction', 'before_viewing'];
    const surveyTrigger: SurveyTriggerMode = validTriggers.includes(body.surveyTrigger)
      ? body.surveyTrigger
      : (existingSettings.surveyTrigger ?? DEFAULT_SETTINGS.surveyTrigger);

    // Validate textDirection
    const validDirections: TextDirection[] = ['auto', 'ltr', 'rtl'];
    const textDirection: TextDirection = validDirections.includes(body.textDirection)
      ? body.textDirection
      : (existingSettings.textDirection ?? DEFAULT_SETTINGS.textDirection);

    // Validate tocPosition
    const validTocPositions: TocPosition[] = ['auto', 'left', 'right'];
    const tocPosition: TocPosition = validTocPositions.includes(body.tocPosition)
      ? body.tocPosition
      : (existingSettings.tocPosition ?? DEFAULT_SETTINGS.tocPosition);

    // Validate tocMaxLevel (must be 1-6)
    const tocMaxLevel = typeof body.tocMaxLevel === 'number' && body.tocMaxLevel >= 1 && body.tocMaxLevel <= 6
      ? body.tocMaxLevel
      : (existingSettings.tocMaxLevel ?? DEFAULT_SETTINGS.tocMaxLevel);

    // Validate explanationVideoMode
    const validVideoModes: ExplanationVideoMode[] = ['optional', 'before_viewing'];
    const explanationVideoMode: ExplanationVideoMode = validVideoModes.includes(body.explanationVideoMode)
      ? body.explanationVideoMode
      : (existingSettings.explanationVideoMode ?? DEFAULT_SETTINGS.explanationVideoMode);

    // Validate headerColors - ensure all values are valid hex colors
    const isValidHexColor = (color: unknown): color is string => {
      if (typeof color !== 'string') return false;
      return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
    };

    const validateHeaderColors = (colors: unknown): HeaderColors => {
      if (!colors || typeof colors !== 'object') {
        return existingSettings.headerColors ?? DEFAULT_SETTINGS.headerColors;
      }
      const colorsObj = colors as Record<string, unknown>;
      return {
        h1: isValidHexColor(colorsObj.h1) ? colorsObj.h1 : (existingSettings.headerColors?.h1 ?? DEFAULT_HEADER_COLORS.h1),
        h2: isValidHexColor(colorsObj.h2) ? colorsObj.h2 : (existingSettings.headerColors?.h2 ?? DEFAULT_HEADER_COLORS.h2),
        h3: isValidHexColor(colorsObj.h3) ? colorsObj.h3 : (existingSettings.headerColors?.h3 ?? DEFAULT_HEADER_COLORS.h3),
        h4: isValidHexColor(colorsObj.h4) ? colorsObj.h4 : (existingSettings.headerColors?.h4 ?? DEFAULT_HEADER_COLORS.h4),
        h5: isValidHexColor(colorsObj.h5) ? colorsObj.h5 : (existingSettings.headerColors?.h5 ?? DEFAULT_HEADER_COLORS.h5),
        h6: isValidHexColor(colorsObj.h6) ? colorsObj.h6 : (existingSettings.headerColors?.h6 ?? DEFAULT_HEADER_COLORS.h6),
      };
    };

    const headerColors = body.headerColors !== undefined
      ? validateHeaderColors(body.headerColors)
      : (existingSettings.headerColors ?? DEFAULT_SETTINGS.headerColors);

    // Merge settings - only update fields that are provided
    const settings: DocumentSettings = {
      allowComments: body.allowComments !== undefined ? Boolean(body.allowComments) : (existingSettings.allowComments ?? DEFAULT_SETTINGS.allowComments),
      allowApprovals: body.allowApprovals !== undefined ? Boolean(body.allowApprovals) : (existingSettings.allowApprovals ?? DEFAULT_SETTINGS.allowApprovals),
      enableSuggestions: body.enableSuggestions !== undefined ? Boolean(body.enableSuggestions) : (existingSettings.enableSuggestions ?? DEFAULT_SETTINGS.enableSuggestions),
      requireLogin: body.requireLogin !== undefined ? Boolean(body.requireLogin) : (existingSettings.requireLogin ?? DEFAULT_SETTINGS.requireLogin),
      showHeatMap: body.showHeatMap !== undefined ? Boolean(body.showHeatMap) : (existingSettings.showHeatMap ?? DEFAULT_SETTINGS.showHeatMap),
      showViewCounts: body.showViewCounts !== undefined ? Boolean(body.showViewCounts) : (existingSettings.showViewCounts ?? DEFAULT_SETTINGS.showViewCounts),
      isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : (existingSettings.isPublic ?? DEFAULT_SETTINGS.isPublic),
      demographicMode,
      demographicRequired: body.demographicRequired !== undefined ? Boolean(body.demographicRequired) : (existingSettings.demographicRequired ?? DEFAULT_SETTINGS.demographicRequired),
      surveyTrigger,
      textDirection,
      defaultLanguage: body.defaultLanguage !== undefined ? String(body.defaultLanguage) : (existingSettings.defaultLanguage ?? DEFAULT_SETTINGS.defaultLanguage),
      forceLanguage: body.forceLanguage !== undefined ? Boolean(body.forceLanguage) : (existingSettings.forceLanguage ?? DEFAULT_SETTINGS.forceLanguage),
      logoUrl: body.logoUrl !== undefined ? String(body.logoUrl) : (existingSettings.logoUrl ?? DEFAULT_SETTINGS.logoUrl),
      brandName: body.brandName !== undefined ? String(body.brandName) : (existingSettings.brandName ?? DEFAULT_SETTINGS.brandName),
      tocEnabled: body.tocEnabled !== undefined ? Boolean(body.tocEnabled) : (existingSettings.tocEnabled ?? DEFAULT_SETTINGS.tocEnabled),
      tocMaxLevel,
      tocPosition,
      explanationVideoUrl: body.explanationVideoUrl !== undefined ? String(body.explanationVideoUrl) : (existingSettings.explanationVideoUrl ?? DEFAULT_SETTINGS.explanationVideoUrl),
      explanationVideoMode,
      enhancedVisibility: body.enhancedVisibility !== undefined ? Boolean(body.enhancedVisibility) : (existingSettings.enhancedVisibility ?? DEFAULT_SETTINGS.enhancedVisibility),
      allowHeaderReactions: body.allowHeaderReactions !== undefined ? Boolean(body.allowHeaderReactions) : (existingSettings.allowHeaderReactions ?? DEFAULT_SETTINGS.allowHeaderReactions),
      headerColors,
      enableHeadingNumbering: body.enableHeadingNumbering !== undefined ? Boolean(body.enableHeadingNumbering) : (existingSettings.enableHeadingNumbering ?? DEFAULT_SETTINGS.enableHeadingNumbering),
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
