import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/comments/[statementId]
 * Fetch comments for a specific suggestion statement.
 * Comments are child Statements with StatementType.comment.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ statementId: string }> }
) {
  try {
    const { statementId } = await params;

    if (!statementId) {
      return NextResponse.json(
        { error: 'Statement ID is required' },
        { status: 400 }
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'userId query parameter is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Verify the parent statement exists and check authorization
    const parentDoc = await db.collection(Collections.statements).doc(statementId).get();
    if (!parentDoc.exists) {
      return NextResponse.json(
        { error: 'Statement not found' },
        { status: 404 }
      );
    }

    const parentStatement = parentDoc.data() as Statement;

    // Authorization: caller must be the statement creator or survey admin
    const isCreator = parentStatement.creatorId === userId;

    // Check if user is survey admin by looking at the question/survey hierarchy
    let isAdmin = false;
    if (!isCreator && parentStatement.topParentId) {
      const topParentDoc = await db.collection(Collections.statements).doc(parentStatement.topParentId).get();
      if (topParentDoc.exists) {
        const topParent = topParentDoc.data() as Statement;
        isAdmin = topParent.creatorId === userId;
      }
    }

    if (!isCreator && !isAdmin) {
      return NextResponse.json(
        { error: 'Not authorized to view comments for this statement' },
        { status: 403 }
      );
    }

    // Query comments
    const commentsSnapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', statementId)
      .where('statementType', '==', StatementType.comment)
      .orderBy('createdAt', 'desc')
      .get();

    const comments: Partial<Statement>[] = commentsSnapshot.docs.map(doc => {
      const data = doc.data() as Statement;

      return {
        statementId: data.statementId,
        statement: data.statement,
        reasoning: data.reasoning,
        createdAt: data.createdAt,
        creator: data.creator,
        creatorId: data.creatorId,
      };
    });

    return NextResponse.json({ comments, count: comments.length });
  } catch (error) {
    logger.error('[GET /api/comments/[statementId]] Error:', error);

    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}
