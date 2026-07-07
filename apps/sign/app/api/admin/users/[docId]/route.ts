import { NextRequest, NextResponse } from 'next/server';
import { DocumentData } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * True when a stored "name" is really an anonymous placeholder rather than a real name,
 * so we can keep looking for a better source. Covers the literal "Anonymous", raw
 * anon_<timestamp> uids, and the "User 123456" fallback produced for guests.
 */
function isAnonymousName(name: unknown): boolean {
  if (typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^anonymous( user)?$/i.test(trimmed)) return true;
  if (/^anon_\d+/i.test(trimmed)) return true;
  if (/^user \d{4,}$/i.test(trimmed)) return true;

  return false;
}

export interface UserData {
  odlUserId: string;
  odlUserDisplayName: string;
  signed: 'signed' | 'rejected' | 'viewed' | 'pending';
  signedAt: number | null;
  approvalsCount: number;
  commentsCount: number;
  rejectionReason?: string;
  /** Satisfaction rating (-1 to 1) when the document footer is in satisfaction mode */
  satisfaction?: number;
  /** Explanation left by users who were not fully satisfied (document-level comment) */
  satisfactionReason?: string;
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
    // Real name captured on any of the user's comments (registered users carry their
    // real displayName here; guests carry an anonymous fallback which we ignore below).
    const nameFromCommentByUser = new Map<string, string>();
    // Document-level comments (parentId === docId) hold satisfaction explanations
    const satisfactionReasonByUser = new Map<string, { text: string; displayName?: string }>();
    commentsSnap.docs.forEach((doc) => {
      const data = doc.data() as DocumentData;
      if (data.creatorId) {
        const count = commentsByUser.get(data.creatorId) || 0;
        commentsByUser.set(data.creatorId, count + 1);

        const commentName = data.creator?.displayName;
        if (commentName && !isAnonymousName(commentName) && !nameFromCommentByUser.has(data.creatorId)) {
          nameFromCommentByUser.set(data.creatorId, commentName);
        }

        if (data.parentId === docId && !data.hide && data.statement) {
          satisfactionReasonByUser.set(data.creatorId, {
            text: data.statement,
            displayName: data.creator?.displayName,
          });
        }
      }
    });

    // Resolve canonical real names from the users collection (usersV2), keyed by uid.
    // This recovers registered users who signed but never left a comment.
    const uniqueUserIds = Array.from(
      new Set(signaturesSnap.docs.map((d) => {
        const sig = d.data() as DocumentData;

        return (sig.odlUserId || sig.userId) as string | undefined;
      }).filter((id): id is string => Boolean(id)))
    );

    const nameFromUsersCollection = new Map<string, string>();
    const USERS_LOOKUP_CHUNK = 300;
    for (let i = 0; i < uniqueUserIds.length; i += USERS_LOOKUP_CHUNK) {
      const chunk = uniqueUserIds.slice(i, i + USERS_LOOKUP_CHUNK);
      const userRefs = chunk.map((id) => db.collection(Collections.users).doc(id));
      const userDocs = await db.getAll(...userRefs);
      userDocs.forEach((userDoc) => {
        if (!userDoc.exists) return;
        const data = userDoc.data() as DocumentData;
        const name = data?.displayName;
        if (name && !isAnonymousName(name)) {
          nameFromUsersCollection.set(userDoc.id, name);
        }
      });
    }

    // Build user list
    const users: UserData[] = signaturesSnap.docs.map((doc) => {
      const sig = doc.data() as DocumentData;
      const userId = sig.odlUserId || sig.userId;

      const satisfactionFeedback = satisfactionReasonByUser.get(userId);

      // Admin always sees the real name when one exists anywhere. Priority:
      // persisted signature name → canonical users-collection name → any comment name
      // → satisfaction-comment name → 'Anonymous' (truly nameless guests only).
      const persistedSigName =
        (!isAnonymousName(sig.odlUserDisplayName) && sig.odlUserDisplayName) ||
        (!isAnonymousName(sig.displayName) && sig.displayName) ||
        undefined;
      const resolvedName =
        persistedSigName ||
        nameFromUsersCollection.get(userId) ||
        nameFromCommentByUser.get(userId) ||
        satisfactionFeedback?.displayName ||
        'Anonymous';

      const userData: UserData = {
        odlUserId: userId,
        odlUserDisplayName: resolvedName,
        signed: sig.signed || 'pending',
        signedAt: sig.date || null,
        approvalsCount: approvalsByUser.get(userId) || 0,
        commentsCount: commentsByUser.get(userId) || 0,
      };

      // Include rejection reason if available
      if (sig.rejectionReason) {
        userData.rejectionReason = sig.rejectionReason;
      }

      // Include satisfaction rating + explanation if available
      if (typeof sig.satisfaction === 'number') {
        userData.satisfaction = sig.satisfaction;
      }
      if (satisfactionFeedback) {
        userData.satisfactionReason = satisfactionFeedback.text;
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
