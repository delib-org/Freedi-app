import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, Statement } from 'delib-npm';
import { getUserIdFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';

/**
 * POST /api/statements/[id]/submit
 * Submit a new solution (option) for a question
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { solutionText, userId: bodyUserId, userName } = body;

    // Get user ID
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate solution text
    if (!solutionText || typeof solutionText !== 'string') {
      return NextResponse.json(
        { error: 'Solution text is required' },
        { status: 400 }
      );
    }

    const trimmedText = solutionText.trim();

    if (trimmedText.length < 3) {
      return NextResponse.json(
        { error: 'Solution must be at least 3 characters' },
        { status: 400 }
      );
    }

    if (trimmedText.length > 500) {
      return NextResponse.json(
        { error: 'Solution must be less than 500 characters' },
        { status: 400 }
      );
    }

    const questionId = params.id;
    const db = getFirestoreAdmin();

    // Check if question exists
    const questionDoc = await db
      .collection(Collections.statements)
      .doc(questionId)
      .get();

    if (!questionDoc.exists) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    // TODO: Check for duplicate/similar solutions using semantic search

    // Create new solution statement
    const statementRef = db.collection(Collections.statements).doc();

    const displayName = userName || getAnonymousDisplayName(userId);

    const newSolution: Partial<Statement> = {
      statementId: statementRef.id,
      statement: trimmedText,
      statementType: StatementType.option,
      parentId: questionId,
      creatorId: userId,
      creator: {
        uid: userId,
        displayName,
        email: '',
        photoURL: '',
        isAnonymous: true,
      },
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      randomSeed: Math.random(), // For random sampling
      consensus: 0,
      hide: false,
    };

    // Transaction to create solution and update question
    await db.runTransaction(async (transaction) => {
      transaction.set(statementRef, newSolution);

      // Update parent question
      const questionRef = db.collection(Collections.statements).doc(questionId);
      const questionData = questionDoc.data();

      transaction.update(questionRef, {
        suggestions: (questionData?.suggestions || 0) + 1,
        numberOfOptions: (questionData?.numberOfOptions || 0) + 1,
        lastUpdate: Date.now(),
      });
    });

    return NextResponse.json({
      success: true,
      solutionId: statementRef.id,
      solution: newSolution,
    });
  } catch (error) {
    console.error('[API] Submit solution error:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit solution',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
