import { NextRequest, NextResponse } from 'next/server';
import { DocumentData } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { Signature } from '@/lib/firebase/queries';
import { logger } from '@/lib/utils/logger';

export interface DocumentStats {
  totalParticipants: number;
  signedCount: number;
  rejectedCount: number;
  viewedCount: number;
  pendingCount: number;
  totalComments: number;
  totalApprovals: number;
  averageApprovalRating: number;
  paragraphStats: ParagraphStat[];
}

interface ParagraphStat {
  paragraphId: string;
  statement: string;
  viewCount: number;
  approvalCount: number;
  avgApproval: number;
  commentCount: number;
}

/**
 * GET /api/admin/stats/[docId]
 * Returns statistics for a document (admin only)
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

    // Get the document to verify ownership
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

    // Get signatures
    const signaturesSnap = await db
      .collection(Collections.signatures)
      .where('documentId', '==', docId)
      .get();

    const signatures = signaturesSnap.docs.map((doc) => doc.data() as Signature);
    const signedCount = signatures.filter((s) => s.signed === 'signed').length;
    const rejectedCount = signatures.filter((s) => s.signed === 'rejected').length;
    const viewedCount = signatures.filter((s) => s.signed === 'viewed').length;
    const totalParticipants = signatures.length;
    const pendingCount = Math.max(0, totalParticipants - signedCount - rejectedCount);

    // Get paragraphs
    const paragraphsSnap = await db
      .collection(Collections.statements)
      .where('parentId', '==', docId)
      .get();

    const paragraphIds = paragraphsSnap.docs.map((doc) => doc.id);

    // Get comments count
    let totalComments = 0;
    if (paragraphIds.length > 0) {
      // Query comments for each paragraph (batch of 10 at a time due to Firestore limitations)
      for (let i = 0; i < paragraphIds.length; i += 10) {
        const batch = paragraphIds.slice(i, i + 10);
        const commentsSnap = await db
          .collection(Collections.statements)
          .where('parentId', 'in', batch)
          .where('statementType', '==', 'comment')
          .get();
        totalComments += commentsSnap.size;
      }
    }

    // Get approvals
    const approvalsSnap = await db
      .collection(Collections.evaluations)
      .where('parentId', '==', docId)
      .get();

    const approvals = approvalsSnap.docs.map((doc) => doc.data() as DocumentData);
    const totalApprovals = approvals.length;
    const averageApprovalRating = totalApprovals > 0
      ? approvals.reduce((sum: number, a: DocumentData) => sum + (a.evaluation || 0), 0) / totalApprovals
      : 0;

    // Build paragraph stats
    const paragraphStats: ParagraphStat[] = [];
    for (const paragraphDoc of paragraphsSnap.docs) {
      const paragraph = paragraphDoc.data();
      const paragraphId = paragraphDoc.id;

      // Get paragraph-specific approvals
      const paragraphApprovals = approvals.filter((a: DocumentData) => a.statementId === paragraphId);
      const avgApproval = paragraphApprovals.length > 0
        ? paragraphApprovals.reduce((sum: number, a: DocumentData) => sum + (a.evaluation || 0), 0) / paragraphApprovals.length
        : 0;

      // Get paragraph comment count
      const paragraphCommentsSnap = await db
        .collection(Collections.statements)
        .where('parentId', '==', paragraphId)
        .where('statementType', '==', 'comment')
        .get();

      paragraphStats.push({
        paragraphId,
        statement: paragraph.statement?.substring(0, 100) || '',
        viewCount: paragraph.viewed || 0,
        approvalCount: paragraphApprovals.length,
        avgApproval: Math.round(avgApproval * 100) / 100,
        commentCount: paragraphCommentsSnap.size,
      });
    }

    // Sort by approval count descending
    paragraphStats.sort((a, b) => b.approvalCount - a.approvalCount);

    const stats: DocumentStats = {
      totalParticipants,
      signedCount,
      rejectedCount,
      viewedCount,
      pendingCount,
      totalComments,
      totalApprovals,
      averageApprovalRating: Math.round(averageApprovalRating * 100) / 100,
      paragraphStats: paragraphStats.slice(0, 10), // Top 10
    };

    return NextResponse.json(stats);
  } catch (error) {
    logger.error('[API] Admin stats failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
