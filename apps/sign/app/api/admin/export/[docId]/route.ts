import { NextRequest, NextResponse } from 'next/server';
import { DocumentData } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections, AdminPermissionLevel } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/export/[docId]
 * Exports document users and their interactions as CSV
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

    // Get all signatures
    const signaturesSnap = await db
      .collection(Collections.signatures)
      .where('documentId', '==', docId)
      .get();

    // Get approvals for counting
    const approvalsSnap = await db
      .collection(Collections.approval)
      .where('documentId', '==', docId)
      .get();

    const approvalsByUser = new Map<string, number>();
    approvalsSnap.docs.forEach((doc) => {
      const data = doc.data() as DocumentData;
      const userKey = data.odlUserId || data.userId;
      const count = approvalsByUser.get(userKey) || 0;
      approvalsByUser.set(userKey, count + 1);
    });

    // Get comments for counting
    const commentsSnap = await db
      .collection(Collections.statements)
      .where('topParentId', '==', docId)
      .where('statementType', '==', 'statement')
      .get();

    const commentsByUser = new Map<string, number>();
    commentsSnap.docs.forEach((doc) => {
      const data = doc.data() as DocumentData;
      if (data.creatorId) {
        const count = commentsByUser.get(data.creatorId) || 0;
        commentsByUser.set(data.creatorId, count + 1);
      }
    });

    // Build CSV content
    const csvHeader = ['User ID', 'Display Name', 'Status', 'Date', 'Approvals Count', 'Comments Count'];
    const csvRows: string[][] = [];

    signaturesSnap.docs.forEach((doc) => {
      const sig = doc.data() as DocumentData;
      const userKey = sig.odlUserId || sig.userId;

      csvRows.push([
        userKey,
        sig.odlUserDisplayName || sig.displayName || 'Anonymous',
        sig.signed || 'pending',
        sig.date ? new Date(sig.date).toISOString() : '',
        String(approvalsByUser.get(userKey) || 0),
        String(commentsByUser.get(userKey) || 0),
      ]);
    });

    // Sort by date descending
    csvRows.sort((a, b) => {
      const dateA = a[3] ? new Date(a[3]).getTime() : 0;
      const dateB = b[3] ? new Date(b[3]).getTime() : 0;

      return dateB - dateA;
    });

    // Generate CSV string
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    };

    const csvContent = [
      csvHeader.join(','),
      ...csvRows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n');

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="document-users-${docId}.csv"`,
      },
    });
  } catch (error) {
    logger.error('[API] Admin export failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
