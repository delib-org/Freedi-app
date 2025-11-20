import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType, Statement } from 'delib-npm';
import { getUserIdFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Handle user selecting an existing solution (create evaluation +1)
 */
async function handleExistingSolution(
  db: Firestore,
  statementId: string,
  questionId: string,
  userId: string,
  questionData: FirebaseFirestore.DocumentData | undefined
) {
  // Check if statement exists
  const statementDoc = await db
    .collection(Collections.statements)
    .doc(statementId)
    .get();

  if (!statementDoc.exists) {
    return NextResponse.json(
      { error: 'Solution not found' },
      { status: 404 }
    );
  }

  // Create evaluation (+1 for agreement)
  const evaluationRef = db.collection(Collections.evaluations).doc();
  const evaluation = {
    evaluationId: evaluationRef.id,
    statementId,
    parentId: questionId,
    evaluatorId: userId,
    evaluation: 1, // Auto +1 when user selects this solution
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  };

  // Transaction to create evaluation and update counters
  await db.runTransaction(async (transaction) => {
    transaction.set(evaluationRef, evaluation);

    // Update statement evaluation count
    const statementRef = db.collection(Collections.statements).doc(statementId);
    transaction.update(statementRef, {
      evaluations: (statementDoc.data()?.evaluations || 0) + 1,
      consensus: (statementDoc.data()?.consensus || 0) + 1,
      lastUpdate: Date.now(),
    });

    // Update parent question
    const questionRef = db.collection(Collections.statements).doc(questionId);
    transaction.update(questionRef, {
      suggestions: (questionData?.suggestions || 0) + 1,
      lastUpdate: Date.now(),
    });
  });

  return NextResponse.json({
    success: true,
    action: 'evaluated' as const,
    statementId,
    evaluation,
  });
}

/**
 * POST /api/statements/[id]/submit
 * Submit a new solution (option) for a question OR evaluate an existing solution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { solutionText, userId: bodyUserId, userName, existingStatementId } = body;

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

    const questionData = questionDoc.data();

    // If user selected an existing solution, create evaluation instead
    if (existingStatementId) {
      return await handleExistingSolution(
        db,
        existingStatementId,
        questionId,
        userId,
        questionData
      );
    }

    // Check user limit for new solutions
    const numberOfOptionsPerUser = questionData?.statementSettings?.numberOfOptionsPerUser || Infinity;

    if (numberOfOptionsPerUser !== Infinity) {
      const userSolutionsQuery = await db
        .collection(Collections.statements)
        .where('parentId', '==', questionId)
        .where('creatorId', '==', userId)
        .where('statementType', '==', StatementType.option)
        .count()
        .get();

      const userSolutionsCount = userSolutionsQuery.data().count;

      if (userSolutionsCount >= numberOfOptionsPerUser) {
        return NextResponse.json(
          {
            error: `You've reached the maximum of ${numberOfOptionsPerUser} solution(s) for this question`,
            code: 'LIMIT_REACHED'
          },
          { status: 403 }
        );
      }
    }

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
      action: 'created' as const,
      statementId: statementRef.id,
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
