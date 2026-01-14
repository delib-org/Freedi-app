import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, AdminPermissionLevel } from '@freedi/shared-types';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { logger } from '@/lib/utils/logger';
import { buildJsonExport } from '@/lib/firebase/exportQueries';
import { sortParagraphs } from '@/lib/utils/paragraphUtils';

/**
 * GET /api/admin/export-json/[docId]
 * Exports comprehensive document data as JSON with anonymized user information
 *
 * Includes:
 * - Document metadata and paragraphs
 * - Demographic questions and anonymized user answers
 * - All interactions (signatures, approvals, comments, suggestions)
 * - Cross-analysis of interactions by demographic segment
 *
 * Privacy features:
 * - User IDs are anonymized (user_1, user_2, etc.)
 * - K-anonymity is applied to demographic segments (min 5 users in production)
 * - Demographic answers are linked to anonymous IDs for research purposes
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

    // Check admin access - must be at least admin level (not viewer) to export
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

    const document = docSnap.data() as StatementWithParagraphs;

    // Get paragraphs from the document
    const paragraphs: Paragraph[] = document.paragraphs
      ? sortParagraphs(document.paragraphs)
      : [];

    if (paragraphs.length === 0) {
      return NextResponse.json(
        { error: 'Document has no paragraphs' },
        { status: 400 }
      );
    }

    // Build the complete export data
    const exportData = await buildJsonExport(document, paragraphs);

    // Create filename using docId (safe for HTTP headers, no encoding issues)
    const filename = `document-export-${docId}.json`;

    console.info(`[API] JSON export for ${docId}: ${exportData.interactions.signatures.length} signatures, ${exportData.interactions.approvals.length} approvals, ${exportData.interactions.comments.length} comments`);

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('[API] JSON export failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
