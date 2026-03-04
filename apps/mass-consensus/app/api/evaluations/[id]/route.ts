import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, Evaluation } from '@freedi/shared-types';
import { getUserIdFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { updateStatementConsensus } from '@/lib/firebase/queries';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/evaluations/[id]
 * Submit or update an evaluation for a solution
 * Follows the same pattern as setEvaluationToDB from main app
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit check - standard for evaluations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.STANDARD);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: statementId } = await params;
    const body = await request.json();
    const { evaluation, userId: bodyUserId, userName } = body;

    // Get user ID
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = bodyUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate evaluation range (-1 to 1)
    if (typeof evaluation !== 'number' || evaluation < -1 || evaluation > 1) {
      return NextResponse.json(
        { error: 'Evaluation must be a number between -1 and 1' },
        { status: 400 }
      );
    }
    const db = getFirestoreAdmin();

    // Get statement to find parentId
    const statementDoc = await db
      .collection(Collections.statements)
      .doc(statementId)
      .get();

    if (!statementDoc.exists) {
      return NextResponse.json(
        { error: 'Statement not found' },
        { status: 404 }
      );
    }

    const statement = statementDoc.data();
    const parentId = statement?.parentId;

    if (!parentId) {
      return NextResponse.json(
        { error: 'Statement has no parent' },
        { status: 400 }
      );
    }

    // Evaluation ID format: `${userId}--${statementId}`
    const evaluationId = `${userId}--${statementId}`;
    const evaluationRef = db.collection(Collections.evaluations).doc(evaluationId);

    const displayName = userName || getAnonymousDisplayName(userId);

    const evaluationData: Partial<Evaluation> = {
      evaluationId,
      parentId,
      statementId,
      evaluatorId: userId,
      evaluator: {
        uid: userId,
        displayName,
        email: '',
        photoURL: '',
        isAnonymous: true,
      },
      evaluation,
      updatedAt: Date.now(),
    };

    // Save evaluation and update userEvaluations in a single transaction
    const userEvaluationId = `${userId}--${parentId}`;
    const userEvaluationRef = db.collection(Collections.userEvaluations).doc(userEvaluationId);

    await db.runTransaction(async (transaction) => {
      const userEvalDoc = await transaction.get(userEvaluationRef);
      const now = Date.now();

      // Save evaluation
      transaction.set(evaluationRef, evaluationData);

      // Update userEvaluations collection to track this evaluation
      transaction.set(userEvaluationRef, {
        userEvaluationId,
        userId,
        parentStatementId: parentId,
        evaluatedOptionsIds: FieldValue.arrayUnion(statementId),
        lastUpdated: now,
        // Only set createdAt if document doesn't exist
        ...(userEvalDoc.exists ? {} : { createdAt: now }),
      }, { merge: true });
    });

    // Update statement consensus (async, don't wait)
    updateStatementConsensus(statementId).catch((error) => {
      logger.error('Failed to update consensus:', error);
    });

    return NextResponse.json({
      success: true,
      evaluationId,
    });
  } catch (error) {
    logger.error('[API] Evaluation error:', error);
    
return NextResponse.json(
      {
        error: 'Failed to save evaluation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluations/[id]
 * Get user's evaluation for a statement
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit check - more lenient for reads
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: statementId } = await params;
    const url = new URL(request.url);
    const queryUserId = url.searchParams.get('userId');
    const cookieUserId = getUserIdFromCookie(request.headers.get('cookie'));
    const userId = queryUserId || cookieUserId;

    if (!userId) {
      return NextResponse.json({ evaluation: null });
    }
    const evaluationId = `${userId}--${statementId}`;

    const db = getFirestoreAdmin();
    const evaluationDoc = await db
      .collection(Collections.evaluations)
      .doc(evaluationId)
      .get();

    if (!evaluationDoc.exists) {
      return NextResponse.json({ evaluation: null });
    }

    return NextResponse.json({
      evaluation: evaluationDoc.data(),
    });
  } catch (error) {
    logger.error('[API] Get evaluation error:', error);
    
return NextResponse.json(
      { error: 'Failed to get evaluation' },
      { status: 500 }
    );
  }
}
