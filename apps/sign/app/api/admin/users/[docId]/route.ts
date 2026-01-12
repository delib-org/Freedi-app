import { NextRequest, NextResponse } from 'next/server';
import { DocumentData } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

export interface UserData {
  odlUserId: string;
  odlUserDisplayName: string;
  signed: 'signed' | 'rejected' | 'viewed' | 'pending';
  signedAt: number | null;
  approvalsCount: number;
  commentsCount: number;
  rejectionReason?: string;
}

/**
 * GET /api/admin/users/[docId]
 * Returns list of users who interacted with the document
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

    // Check admin access (owner or collaborator)
    const accessResult = await checkAdminAccess(db, docId, userId);

    if (!accessResult.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.toLowerCase();

    // Get all signatures for this document
    let signaturesQuery = db
      .collection(Collections.signatures)
      .where('documentId', '==', docId);

    if (status && status !== 'all') {
      signaturesQuery = signaturesQuery.where('signed', '==', status);
    }

    const signaturesSnap = await signaturesQuery.get();

    // Get approvals for counting
    const approvalsSnap = await db
      .collection(Collections.approval)
      .where('documentId', '==', docId)
      .get();

    const approvalsByUser = new Map<string, number>();
    approvalsSnap.docs.forEach((doc) => {
      const data = doc.data() as DocumentData;
      const count = approvalsByUser.get(data.odlUserId) || 0;
      approvalsByUser.set(data.odlUserId, count + 1);
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

    // Build user list
    const users: UserData[] = signaturesSnap.docs.map((doc) => {
      const sig = doc.data() as DocumentData;
      const userId = sig.odlUserId || sig.userId;

      const userData: UserData = {
        odlUserId: userId,
        odlUserDisplayName: sig.odlUserDisplayName || sig.displayName || 'Anonymous',
        signed: sig.signed || 'pending',
        signedAt: sig.date || null,
        approvalsCount: approvalsByUser.get(userId) || 0,
        commentsCount: commentsByUser.get(userId) || 0,
      };

      // Include rejection reason if available
      if (sig.rejectionReason) {
        userData.rejectionReason = sig.rejectionReason;
      }

      return userData;
    });

    // Apply search filter
    let filteredUsers = users;
    if (search) {
      filteredUsers = users.filter(u =>
        u.odlUserDisplayName.toLowerCase().includes(search) ||
        u.odlUserId.toLowerCase().includes(search)
      );
    }

    // Sort by signed date descending
    filteredUsers.sort((a, b) => (b.signedAt || 0) - (a.signedAt || 0));

    return NextResponse.json({
      users: filteredUsers,
      total: filteredUsers.length,
    });
  } catch (error) {
    logger.error('[API] Admin users failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
