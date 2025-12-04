import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from 'delib-npm';

export interface DocumentSettings {
  allowComments: boolean;
  allowApprovals: boolean;
  requireLogin: boolean;
  showHeatMap: boolean;
  showViewCounts: boolean;
  isPublic: boolean;
}

const DEFAULT_SETTINGS: DocumentSettings = {
  allowComments: true,
  allowApprovals: true,
  requireLogin: false,
  showHeatMap: true,
  showViewCounts: true,
  isPublic: true,
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
    };

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API] Admin settings GET failed:', error);

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
    const settings: DocumentSettings = {
      allowComments: Boolean(body.allowComments),
      allowApprovals: Boolean(body.allowApprovals),
      requireLogin: Boolean(body.requireLogin),
      showHeatMap: Boolean(body.showHeatMap),
      showViewCounts: Boolean(body.showViewCounts),
      isPublic: Boolean(body.isPublic),
    };

    // Update document with new settings
    await docRef.update({
      signSettings: settings,
      lastUpdate: Date.now(),
    });

    console.info(`[API] Settings updated for document ${docId} by user ${userId}`);

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('[API] Admin settings PUT failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
