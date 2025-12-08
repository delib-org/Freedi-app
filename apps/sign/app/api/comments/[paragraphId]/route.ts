import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections, StatementType } from 'delib-npm';

interface CommentInput {
  statement: string;
  documentId: string;
}

/**
 * GET /api/comments/[paragraphId]
 * Get comments for a paragraph
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;

    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', paragraphId)
      .where('statementType', '==', StatementType.statement)
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get();

    const comments = snapshot.docs
      .map((doc) => doc.data())
      .filter((c) => !c.hide);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('[Comments API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments/[paragraphId]
 * Create a new comment on a paragraph
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: CommentInput = await request.json();
    const { statement, documentId } = body;

    // Validate input
    if (!statement || statement.trim().length === 0) {
      return NextResponse.json(
        { error: 'Comment text is required' },
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // For embedded paragraphs, the topParentId is the documentId itself
    // We no longer look up individual paragraph documents since they're embedded

    // Get display name
    const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);

    // Generate unique ID
    const statementId = `${userId}--${Date.now()}--${Math.random().toString(36).substring(2, 9)}`;

    const comment = {
      statementId,
      statement: statement.trim(),
      statementType: StatementType.statement,
      parentId: paragraphId, // Reference to embedded paragraph
      paragraphId, // Explicit reference for clarity
      topParentId: documentId,
      documentId, // Explicit reference for queries
      creatorId: userId,
      creator: {
        displayName,
        uid: userId,
      },
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      consensus: 0,
      hide: false,
    };

    await db.collection(Collections.statements).doc(statementId).set(comment);

    console.info(`[Comments API] Created comment: ${statementId}`);

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    console.error('[Comments API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comments/[paragraphId]
 * Delete a comment (requires comment ID in body)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    await params; // Consume params even if not used
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { commentId } = body;

    if (!commentId) {
      return NextResponse.json(
        { error: 'commentId is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Verify ownership
    const commentRef = await db.collection(Collections.statements).doc(commentId).get();
    if (!commentRef.exists) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const comment = commentRef.data();
    if (comment?.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this comment' },
        { status: 403 }
      );
    }

    // Soft delete by setting hide flag
    await db.collection(Collections.statements).doc(commentId).update({
      hide: true,
      lastUpdate: Date.now(),
    });

    console.info(`[Comments API] Deleted comment: ${commentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Comments API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
